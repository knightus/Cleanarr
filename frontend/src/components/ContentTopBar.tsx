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
import React, {FunctionComponent, useState} from "react";
import {bytesToSize} from "../util";

type SelectedSummaryRow = {
  title: string,
  fileCount: number,
  totalBytes: number,
};

type DupeMovieTopBarProps = {
  loading: boolean,
  deleting: boolean,
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
  onSelectVisible: () => void,
  onDeselectVisible: () => void,
  selectedSummary: SelectedSummaryRow[],
}

export const ContentTopBar:FunctionComponent<DupeMovieTopBarProps> = (props) => {
  const {
    loading,
    deleting,
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
    onSelectVisible,
    onDeselectVisible,
    selectedSummary,
  } = props;

  const [showDeleteWarning, setShowDeleteWarning] = useState(false);

  // RED TEAM #7: single source of truth for "is the filter actually active?".
  // Trim guards against the whitespace-only case where the input has a stray
  // space but the visibleItems result is identical to items — without this,
  // "Showing X of Y" badge + clear icon + Deselect-Visible button all appear
  // misleadingly while the list is unchanged.
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
          controls — most discoverable layout, no sticky-positioning complexity. */}
      <Pane display="flex" alignItems="center" marginBottom={majorScale(1)}>
        <TextInput
          placeholder="Filter by title (e.g. 'resident')"
          value={filterText}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onFilterChange(e.target.value)}
          width={320}
          marginRight={majorScale(1)}
        />
        {hasActiveFilter && (
          <IconButton
            icon="cross"
            appearance="minimal"
            onClick={() => onFilterChange('')}
            marginRight={majorScale(2)}
            title="Clear filter"
          />
        )}
        {hasActiveFilter && (
          <Heading size={100} marginRight={majorScale(2)}>
            Showing {visibleCount} of {numContent}
          </Heading>
        )}
        {hasActiveFilter && (
          <Button
            appearance="default"
            intent="success"
            onClick={onSelectVisible}
            disabled={visibleCount === 0}
            marginRight={majorScale(1)}
          >Select Visible</Button>
        )}
        {hasActiveFilter && (
          <Button
            appearance="default"
            intent="warning"
            onClick={onDeselectVisible}
            disabled={visibleCount === 0}
          >Deselect Visible</Button>
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
              Deleting Items
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
        <Pane maxHeight={300} overflowY="auto" border="muted" padding={majorScale(1)}>
          {selectedSummary.map((row, i) => (
            <Pane key={i} display="flex" justifyContent="space-between" paddingY={4}>
              <Paragraph flex={1} marginRight={majorScale(1)}>{row.title}</Paragraph>
              <Paragraph color="muted">
                {row.fileCount} file{row.fileCount === 1 ? '' : 's'} &middot; {bytesToSize(row.totalBytes)}
              </Paragraph>
            </Pane>
          ))}
        </Pane>
      </Dialog>
    </>
  )
};
