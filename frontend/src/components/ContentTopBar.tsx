import {
  Button,
  Dialog,
  Heading,
  IconButton,
  majorScale,
  Pane,
  Paragraph,
  Pill,
  SegmentedControl,
  Spinner,
  Switch,
  TextInput
} from "evergreen-ui";
import React, {FunctionComponent, useEffect, useRef, useState} from "react";
import {bytesToSize} from "../util";

type SelectedRelease = {
  filename: string,
  videoSize: string,
  sizeBytes: number,
};


// Delay between the last keystroke and the actual filter recomputation.
// Filtering against title + seriesTitle + every media.parts[].file across
// 1000+ items per keystroke was sluggish in real-world use; debouncing pushes
// the work outside the typing hot path.
const FILTER_DEBOUNCE_MS = 200;

type SelectedSummaryRow = {
  title: string,
  context: string,
  fileCount: number,
  totalBytes: number,
  releases: SelectedRelease[],
};

type DupeMovieTopBarProps = {
  loading: boolean,
  deleting: boolean,
  deleteDone: number,
  deleteTotal: number,
  includeIgnored: boolean,
  numContent: number,
  numSelected: number,
  totalSize: string,
  onDeleteMedia: () => void,
  onRefresh: () => void,
  listingType: string,
  listingOptions: any[],
  onListingTypeChange: (type: string) => void,
  onDeselectAll: () => void,
  onResetSelection: () => void,
  onInvertSelection: () => void,
  onChangeIncludeIgnored: (value: boolean) => void,
  filterText: string,
  onFilterChange: (value: string) => void,
  visibleCount: number,
  selectedSummary: SelectedSummaryRow[],
}

export const ContentTopBar:FunctionComponent<DupeMovieTopBarProps> = (props) => {
  const {
    loading,
    deleting,
    deleteDone,
    deleteTotal,
    includeIgnored,
    numContent,
    numSelected,
    totalSize,
    onDeleteMedia,
    onRefresh,
    listingType,
    listingOptions,
    onListingTypeChange,
    onDeselectAll,
    onResetSelection,
    onInvertSelection,
    filterText,
    onFilterChange,
    visibleCount,
    selectedSummary,
  } = props;

  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  // Local input state is the immediate, every-keystroke value the user sees in
  // the field. We mirror it to the store (which drives `visibleItems`) only
  // after FILTER_DEBOUNCE_MS of quiet — that keeps typing snappy even with
  // 1000+ items and filename-path matching enabled.
  const [inputValue, setInputValue] = useState(filterText);
  const debounceTimer = useRef<number | null>(null);

  // External clears (refresh, listing-type change) push '' through the
  // filterText prop. Reflect that back into the input so the field clears too.
  useEffect(() => {
    setInputValue(filterText);
  }, [filterText]);

  useEffect(() => {
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
    }
    if (inputValue === filterText) return; // nothing to flush
    debounceTimer.current = window.setTimeout(() => {
      onFilterChange(inputValue);
    }, FILTER_DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current !== null) {
        window.clearTimeout(debounceTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const clearFilter = () => {
    setInputValue('');
    if (debounceTimer.current !== null) {
      window.clearTimeout(debounceTimer.current);
    }
    onFilterChange('');
  };

  // RED TEAM #7: single source of truth for "is the filter actually active?".
  // Driven by the *committed* filterText (post-debounce), not the live input.
  // The "Showing X of Y" badge appearing mid-keystroke would otherwise lie
  // about the still-pending visibleCount.
  const hasActiveFilter = filterText.trim().length > 0;

  const onClickConfirmDelete = () => {
    setShowDeleteWarning(false);
    onDeleteMedia();
  };

  return (
    <>
    <Pane background="tint2"
          borderRadius={3}
          padding={majorScale(2)}
    >
      {/* VALIDATION #4: filter input lives in its own row above the existing
          controls — most discoverable layout, no sticky-positioning complexity.
          Match scope: title + seriesTitle + every media.parts[].file (so users
          can search by filename when Plex metadata diverges from disk names). */}
      <Pane display="flex" alignItems="center" marginBottom={majorScale(1)}>
        <TextInput
          placeholder="Filter by title, show, or filename"
          value={inputValue}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value)}
          width={320}
          marginRight={majorScale(1)}
        />
        {inputValue.trim().length > 0 && (
          <IconButton
            icon="cross"
            appearance="minimal"
            onClick={clearFilter}
            marginRight={majorScale(2)}
            title="Clear filter"
          />
        )}
        {hasActiveFilter && (
          <Heading size={100} marginRight={majorScale(2)}>
            Showing {visibleCount} of {numContent}
          </Heading>
        )}
      </Pane>
      <Pane display="flex">
        <Pane flex={1} alignItems="center" display="flex">
          <IconButton
            icon="refresh"
            onClick={onRefresh}
          />
          <SegmentedControl
            name="switch"
            marginX={majorScale(2)}
            width={160}
            height={32}
            options={listingOptions}
            value={listingType}
            onChange={value => onListingTypeChange(value.toString())}
          />
        </Pane>
        <Pane display="flex">
          { numContent > 0 && numSelected === 0 ? (
            <Button
              appearance="default"
              intent="none"
              disabled={numSelected !== 0}
              onClick={() => onResetSelection()}
            >Reset Selection</Button>
          ) : (
            <Button
              appearance="default"
              intent="none"
              disabled={numSelected === 0}
              onClick={() => onDeselectAll()}
            >Deselect All</Button>
          )}
        </Pane>
        <Pane display="flex">
          <Button
            appearance="default"
            intent="none"
            disabled={numSelected === 0}
            onClick={() => onInvertSelection()}
          >Invert Selection</Button>
        </Pane>
        <Pane display="flex">
          {deleting ?
            <Button
              appearance="primary"
              intent="danger"
              disabled={true}
            >
              <Spinner size={16} marginRight={8}/>
              {deleteTotal > 0 ? `Deleting ${deleteDone} of ${deleteTotal}…` : 'Deleting Items'}
            </Button>
            :
            <Button
              appearance="primary"
              intent="danger"
              disabled={numSelected === 0}
              onClick={() => setShowDeleteWarning(true)}
            >Delete Selected Items</Button>
          }
        </Pane>
      </Pane>
      <Pane display={"flex"} paddingTop={majorScale(2)}>
        <Pane flex={1} display={"flex"}>
          <Heading marginRight={30}>
            Content Found:
            <Pill display="inline-flex" margin={8} color="green">{ loading ? '-' : numContent }</Pill>
          </Heading>
          <Heading marginRight={30}>
            Selected:
            <Pill display="inline-flex" margin={8} color="green">{ loading ? '-' : numSelected }</Pill>
          </Heading>
          <Heading marginRight={30}>
            Size:
            <Pill display="inline-flex" margin={8} color="orange">{ loading ? '-' : totalSize }</Pill>
          </Heading>
        </Pane>
        <Pane display={"flex"} alignItems={"center"}>
          <Switch
              height={20}
              checked={includeIgnored}
              onChange={e => props.onChangeIncludeIgnored(e.target.checked)}
              marginRight={10}
          />
          <Heading size={100}>Show Ignored</Heading>
        </Pane>
      </Pane>
    </Pane>
      {/* RED TEAM #2: expanded confirm dialog. Bare "delete N items?" was
          dangerous for cumulative cross-filter batches — user can permanently
          delete files they forgot they selected across earlier filters. Now
          they see every affected title before confirming. */}
      <Dialog
        isShown={showDeleteWarning}
        title="Confirm deletion"
        intent="danger"
        confirmLabel={`Delete ${numSelected} items`}
        onConfirm={onClickConfirmDelete}
        onCloseComplete={() => setShowDeleteWarning(false)}
      >
        <Paragraph marginBottom={majorScale(1)}>
          You are about to permanently delete {numSelected} file{numSelected === 1 ? '' : 's'} across {selectedSummary.length} title{selectedSummary.length === 1 ? '' : 's'}. This cannot be undone.
        </Paragraph>
        <Pane maxHeight={320} overflowY="auto" border="muted" padding={majorScale(1)}>
          {selectedSummary.map((row, i) => (
            <Pane
              key={i}
              paddingY={majorScale(1)}
              borderBottom={i < selectedSummary.length - 1 ? 'muted' : undefined}
            >
              <Pane display="flex" justifyContent="space-between">
                <Paragraph flex={1} marginRight={majorScale(1)} fontWeight={500}>{row.title}</Paragraph>
                <Paragraph color="muted">
                  {row.fileCount} file{row.fileCount === 1 ? '' : 's'} &middot; {bytesToSize(row.totalBytes)}
                </Paragraph>
              </Pane>
              {row.context && (
                <Paragraph size={300} color="muted">{row.context}</Paragraph>
              )}
              {row.releases.map((rel, j) => (
                <Pane
                  key={j}
                  display="flex"
                  justifyContent="space-between"
                  paddingLeft={majorScale(2)}
                  paddingTop={majorScale(1) / 2}
                >
                  <Paragraph size={300} flex={1} marginRight={majorScale(1)} wordBreak="break-all">
                    {rel.filename}
                  </Paragraph>
                  <Paragraph size={300} color="muted" whiteSpace="nowrap">
                    {rel.videoSize} &middot; {bytesToSize(rel.sizeBytes)}
                  </Paragraph>
                </Pane>
              ))}
            </Pane>
          ))}
        </Pane>
      </Dialog>
    </>
  )
};
