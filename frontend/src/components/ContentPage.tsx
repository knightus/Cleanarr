import {majorScale, Pane, toaster} from "evergreen-ui";
import {autorun} from "mobx";
import {Observer} from "mobx-react-lite";
import React, {FunctionComponent, useCallback, useEffect, useState} from 'react';
import {deletedMediaContext, mediaContext} from "../stores/MediaStore";
import {Media, Content} from "../types";
import {bytesToSize, fileBasename, sumMediaSize} from "../util";
import {ContentItem} from "./ContentItem";
import {ContentList} from "./ContentList";
import {ContentTopBar} from "./ContentTopBar";
import {serverInfoContext} from "../stores/ServerInfoStore";
import {contentContext} from "../stores/ContentStore";

export const ContentPage:FunctionComponent<any> = () => {

  const listingTypes = [
    {
      label: 'Duplicates',
      value: 'duplicate'
    },
    {
      label: 'Samples',
      value: 'sample'
    },
  ];

  const [listingType, setListingType] = useState(listingTypes[0].value);

  const contentStore = React.useContext(contentContext);
  const mediaStore = React.useContext(mediaContext);
  const deletedMediaStore = React.useContext(deletedMediaContext);
  const serverInfoStore = React.useContext(serverInfoContext);

  useEffect(() => {
    onRefresh();
  });

  const onListingTypeChange = (listingType: string): void => {
    setListingType(listingType);
    // RED TEAM #4: clear filter on tab switch so Samples doesn't inherit a
    // stale "duplicates" filter and surface a misleading empty state.
    contentStore.setFilterText('');
    onRefresh();
  };

  const onDeleteMedia = () => {
    const total = mediaStore.length;
    mediaStore.startDeleteProgress(total);
    toaster.warning(`Deleting ${total} item${total === 1 ? '' : 's'}...`, {
      duration: 60,
      id: 'delete-toaster'
    });

    // Freed space is summed locally from the releases we actually delete, so
    // the completion toast can report it without a round-trip.
    let freedBytes = 0;
    const deletions: Promise<any>[] = [];

    contentStore.items.forEach(movie => {
      movie.media.forEach(media => {
        if (media.id in mediaStore.media) {
          deletions.push(
            mediaStore.deleteMedia(movie.library, movie.key, media)
              .then(() => {
                deletedMediaStore.addMedia(media);
                freedBytes += sumMediaSize(media);
                mediaStore.markDeleteCompleted();
              })
              // A single failed delete must not reject the whole batch and
              // strand the spinner — count it and keep going.
              .catch(() => {
                mediaStore.markDeleteFailed();
              })
              .finally(() => {
                // Tick the toast live as each release settles. evergreen
                // replaces the same-id toast, so the count updates in place.
                const done = mediaStore.deleteSettled;
                toaster.warning(
                  `Deleting… ${done} of ${total} done, ${total - done} left`,
                  {duration: 60, id: 'delete-toaster'}
                );
              })
          );
        }
      });
    });

    Promise.all(deletions).then(() => {
      mediaStore.finishDeleteProgress();
      serverInfoStore.loadDeletedSizes();

      const ok = mediaStore.deleteCompleted;
      const failed = mediaStore.deleteFailed;
      if (failed > 0) {
        toaster.warning(
          `Deleted ${ok} file${ok === 1 ? '' : 's'} (freed ${bytesToSize(freedBytes)}), ${failed} failed.`,
          {duration: 8, id: 'delete-toaster'}
        );
      } else {
        toaster.success(
          `Deleted ${ok} file${ok === 1 ? '' : 's'} — freed ${bytesToSize(freedBytes)}!`,
          {duration: 5, id: 'delete-toaster'}
        );
      }

      setTimeout(() => {
        onRefresh();
      }, 4500);
    });
  };

  const onRefresh = () => {
    mediaStore.reset();
    deletedMediaStore.reset();
    // RED TEAM #4/#5: clear filter on every refresh path (manual + the 4.5s
    // post-delete timer). Without this, filterText survives the race window
    // and gives the user a stale view of the freshly-loaded data.
    contentStore.setFilterText('');
    if (listingType === 'duplicate') {
      contentStore.loadDupeContent();
    } else if (listingType === 'sample') {
      contentStore.loadSampleMovies();
    }
    serverInfoStore.loadDeletedSizes();
  };

  const onDeselectAll = () => {
    mediaStore.reset();
  };

  const onResetSelection = useCallback(() => {
    contentStore.items.forEach((movie: Content) => {
      let _media = [
        ...movie.media
      ];
      let sortedMedia = _media
        .sort((a, b) => {
          const aSize = sumMediaSize(a);
          const bSize = sumMediaSize(b);
          if (aSize < bSize) return 1;
          if (aSize > bSize) return -1;
          return 0;
        })
        .sort((a, b) => {
          if (a.width < b.width) return 1;
          if (a.width > b.width) return -1;
          return 0;
        });

      // Remove the top entry and then select/check (for removal) the rest
      sortedMedia.forEach(((media, index) => {
        if (index !== 0) {
          mediaStore.addMedia(media);
        }
      }));
    });
  }, [mediaStore, contentStore.items]);


  // RED TEAM #1: replace the pre-existing dep-tracking autorun (which re-fired
  // smart-defaults on every items change — ignore-toggle, delete-refresh, etc.,
  // clobbering curated cross-filter batches) with a one-shot guard tied to the
  // loading→ready transition. Smart-select runs once per load cycle.
  useEffect(() => {
    let hasAutoSelectedThisLoad = false;
    const dispose = autorun(() => {
      const isLoading = contentStore.loading;
      if (isLoading) {
        hasAutoSelectedThisLoad = false;
        return;
      }
      if (!hasAutoSelectedThisLoad && contentStore.items.length > 0) {
        hasAutoSelectedThisLoad = true;
        onResetSelection();
      }
    });
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RED TEAM #6: keep MediaStore selection in sync with the live content set.
  // Drops orphans (Plex re-scan invalidated id, item ignored, item deleted
  // upstream) so the "Selected: N" pill never lies.
  useEffect(() => {
    const dispose = autorun(() => {
      mediaStore.reconcileWith(contentStore.content);
    });
    return dispose;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // RED TEAM #2: breakdown for the expanded delete-confirm dialog. Cumulative
  // cross-filter selections make a bare "delete N items" prompt dangerous —
  // user can forget what they selected three filters ago. Computed inside the
  // inner Observer below (not useMemo) so MobX reactivity tracks it correctly:
  // ContentPage itself only re-renders on listingType change, but the inner
  // Observer re-renders on every relevant observable update.
  const buildSelectedSummary = (): {
    title: string;
    context: string;
    fileCount: number;
    totalBytes: number;
    releases: { filename: string; videoSize: string; sizeBytes: number }[];
  }[] => {
    const out: {
      title: string;
      context: string;
      fileCount: number;
      totalBytes: number;
      releases: { filename: string; videoSize: string; sizeBytes: number }[];
    }[] = [];
    contentStore.items.forEach((movie: Content) => {
      const matched = movie.media.filter(m => m.id in mediaStore.media);
      if (matched.length === 0) return;

      // Title stays generic (e.g. "Episode 2 (2023)"); disambiguating context
      // — series/season then library — goes on the line beneath it so users
      // can tell which show/library a generic title belongs to.
      const title = movie.year ? `${movie.title} (${movie.year})` : movie.title;
      const contextParts: string[] = [];
      if (movie.seriesTitle) contextParts.push(movie.seriesTitle);
      if (movie.seasonEpisode) contextParts.push(movie.seasonEpisode);
      if (movie.library) contextParts.push(movie.library);

      out.push({
        title,
        context: contextParts.join(' · '),
        fileCount: matched.length,
        totalBytes: matched.reduce((acc, m) => acc + sumMediaSize(m), 0),
        releases: matched.map(m => ({
          filename: m.parts.map(p => fileBasename(p.file)).join(', '),
          videoSize: m.width ? `${m.width} × ${m.height}` : '-',
          sizeBytes: sumMediaSize(m),
        })),
      });
    });
    return out;
  };

  const onInvertSelection = () => {
    contentStore.items.forEach(movie => {
      movie.media.forEach(media => {
        if (media.id in mediaStore.media) {
          mediaStore.removeMedia(media);
        } else {
          mediaStore.addMedia(media);
        }
      });
    });
  };

  const onDeleteMediaItem = (movie: Content, media: Media) => {
    toaster.warning(`Deleting item...`, {
      duration: 5,
      id: 'delete-toaster'
    });
    mediaStore.isDeleting = true;
    mediaStore.deleteMedia(movie.library, movie.key, media).then(() => {
      deletedMediaStore.addMedia(media);
      mediaStore.isDeleting = false;
      toaster.success(`Item deleted!`, {
        duration: 5,
        id: 'delete-toaster'
      });

      serverInfoStore.loadDeletedSizes();
    })
  }

  const onIgnoreContent = (content: Content) => {
    contentStore.ignoreContent(content.key);
  }

  const onUnIgnoreContent = (content: Content) => {
    contentStore.unIgnoreContent(content.key);
  }

  const onChangeIncludeIgnored = (value: boolean) => {
    contentStore.setIncludeIgnore(value);
    if (!value) {
      contentStore.ignoredItems.forEach(movie => {
        movie.media.forEach(media => {
          if (media.id in mediaStore.media) {
            mediaStore.removeMedia(media);
          }
        });
      });
    }
  }

  const renderMovieList = () => (
    <Observer>
      {() => (
        <ContentList
          key={`${contentStore.length}_${contentStore.ignoredItems.length}`}
          loading={contentStore.loading}
          loadingFailed={contentStore.loadingFailed}
          loadingError={contentStore.loadingError}
          listingType={listingType}
          content={contentStore.visibleItems}
          totalCount={contentStore.length}
          isFiltered={contentStore.filterText.trim().length > 0}
          renderContentItem={renderMovieItem}
        />
      )}
    </Observer>
  );

  // RED TEAM #3: stable React key (Plex ratingKey) prevents reconciliation
  // from reassigning a ContentItem's open dialog state to a different content
  // when the filter narrows the visible list.
  const renderMovieItem = (movie: Content) => (
    <Observer key={movie.key}>
      {() => (
        <ContentItem
          addMedia={(media: Media) => mediaStore.addMedia(media)}
          removeMedia={(media: Media) => mediaStore.removeMedia(media)}
          onDeleteMedia={onDeleteMediaItem}
          onIgnoreContent={onIgnoreContent}
          onUnIgnoreContent={onUnIgnoreContent}
          selectedMedia={mediaStore.media}
          deletedMedia={deletedMediaStore.media}
          content={movie}
        />
      )}
    </Observer>
  );

  const renderTopPane = () => {
    return (
      <Observer>
        {() => (
          <ContentTopBar
            loading={contentStore.loading}
            deleting={mediaStore.isDeleting}
            deleteDone={mediaStore.deleteSettled}
            deleteTotal={mediaStore.deleteTotal}
            includeIgnored={contentStore.includeIgnored}
            numContent={contentStore.length}
            numSelected={mediaStore.length}
            totalSize={bytesToSize(mediaStore.totalSizeBytes)}
            onDeleteMedia={onDeleteMedia}
            onRefresh={onRefresh}
            listingOptions={listingTypes}
            listingType={listingType}
            onListingTypeChange={onListingTypeChange}
            onDeselectAll={onDeselectAll}
            onResetSelection={onResetSelection}
            onInvertSelection={onInvertSelection}
            onChangeIncludeIgnored={onChangeIncludeIgnored}
            filterText={contentStore.filterText}
            onFilterChange={(v: string) => contentStore.setFilterText(v)}
            visibleCount={contentStore.visibleLength}
            selectedSummary={buildSelectedSummary()}
          />
        )}
      </Observer>
    )
  };

  return (
      <Observer>
        {() => (
          <Pane
            border="default"
            padding={majorScale(1)}
          >
            { renderTopPane() }
            { renderMovieList() }
          </Pane>
        )}
      </Observer>
  )
};
