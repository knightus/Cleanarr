import {Alert, majorScale, Pane, Paragraph, Spinner} from "evergreen-ui";
import React, {FunctionComponent} from 'react';
import {Content} from "../types";

type DupeMovieListProps = {
  loading: boolean,
  loadingFailed: boolean,
  loadingError: Error | null,
  listingType: string,
  content: Content[],
  totalCount: number,
  isFiltered: boolean,
  // RED TEAM #3: callers must produce a stable React key (e.g. `movie.key`).
  // The previous `(movie, index) => ...` signature let React reconcile two
  // different content items onto the same DOM node when the filter narrowed
  // the list, which could re-target an open per-item delete dialog at the
  // wrong file.
  renderContentItem: (movie: Content) => JSX.Element,
}

export const ContentList:FunctionComponent<DupeMovieListProps> = (props) => {
  const {
    loading,
    loadingFailed,
    loadingError,
    listingType,
    content,
    totalCount,
    isFiltered,
    renderContentItem
  } = props;

  const renderLoader = () => (
    <Pane
      display="flex"
      flexDirection={"column"}
      alignItems="center"
      background="tint2"
      borderRadius={3}
      padding={majorScale(2)}
      marginY={majorScale(1)}
    >
      { loadingFailed ?
        renderErrorAlert()
        :
        <>
          <Spinner size={30} flex={0}/>
          <Paragraph marginTop={majorScale(1)}>Loading...</Paragraph>
        </>
      }
    </Pane>
  );

  const renderErrorAlert = () => {
    return (
      <Alert
        intent="danger"
        title="Failed to load content!"
      >
        {loadingError ? loadingError.message : 'Please check your Plex settings and try again.'}
      </Alert>
    )
  }

  // Distinguish "no content at all" (success state — nothing to clean up) from
  // "no items match your filter" (informational — try a different keyword).
  // Without this, an over-aggressive filter looked identical to a clean library.
  const renderEmptyMessage = () => {
    const noMatches = isFiltered && totalCount > 0;
    return (
      <Pane
        display="flex"
        flexDirection={"column"}
        alignItems="center"
        background="tint2"
        borderRadius={3}
        padding={majorScale(2)}
        marginY={majorScale(1)}
      >
        <Alert
          intent={noMatches ? "warning" : "success"}
          title={noMatches
            ? "No items match your filter"
            : `No ${listingType} content found`}
        />
      </Pane>
    );
  };

  const renderMovieList = () => (
    <>
    {content.map((movie: Content) => renderContentItem(movie))}
    </>
  );


  return (
      <>
      { (loading || loadingFailed) ?
        renderLoader()
        : content.length === 0 ?
          renderEmptyMessage()
        :
        renderMovieList()
      }
      </>
  )
};
