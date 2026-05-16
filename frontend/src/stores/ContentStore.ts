import {action, computed, observable, runInAction} from "mobx";
import React, {Context} from "react";
import {Content} from "../types";
import {getDupeContent, getSampleContent, ignoreMedia, unIgnoreMedia} from "../util/api";

// Number of parallel page requests to Plex. Keep low to avoid upstream timeouts.
export const PAGE_SIZE: number = Number(process.env.REACT_APP_PAGE_SIZE) || 3;

export class ContentStore {
  @observable.deep
  content: Content[] = [];

  @observable
  loading: boolean = false;

  @observable
  loadingFailed: boolean = false;

  @observable
  loadingError: Error|null = null;

  @observable
  includeIgnored: boolean = false;

  // Substring filter applied client-side to already-loaded `items`.
  // Kept OUT of the `items` getter so the smart-default autorun in
  // ContentPage does not re-fire on every keystroke.
  @observable
  filterText: string = '';

  @computed
  get items(): Content[] {
    if (this.includeIgnored) {
      return this.content;
    }
    return this.content.filter(item => !item.ignored);
  }

  @computed
  get ignoredItems(): Content[] {
    return this.content.filter(item => !!item.ignored);
  }

  @computed
  get length(): number {
    return this.items.length;
  }

  // Case-insensitive substring match against `title` + `seriesTitle`.
  // Whitespace-only filterText is treated as "no filter" (RED TEAM #7).
  @computed
  get visibleItems(): Content[] {
    const q = this.filterText.trim().toLowerCase();
    if (!q) return this.items;
    return this.items.filter(item => {
      const title = (item.title || '').toLowerCase();
      const series = (item.seriesTitle || '').toLowerCase();
      return title.includes(q) || series.includes(q);
    });
  }

  @computed
  get visibleLength(): number {
    return this.visibleItems.length;
  }

  @action
  setContent(movies: Content[]) {
    this.content = movies
  }

  @action
  setIncludeIgnore(value: boolean) {
    this.includeIgnored = value;
  }

  @action
  setFilterText(value: string) {
    this.filterText = value;
  }

  loadContent(handlerFn: () => Promise<any>): void {
    this.loading = true;
    this.loadingFailed = false;
    this.loadingError = null;
    this.setContent([]);
    handlerFn().then(result => {
      this.setContent(result.data);
      this.loading = false;
    }).catch((error) => {

      this.loading = false;
      this.loadingFailed = true;

      if (error.response?.data?.error) {
        this.loadingError = new Error(error.response?.data?.error);
      }
    });
  }

  @action
  async ignoreContent(contentKey: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ignoreMedia(contentKey)
          .then(() => {
            for (let i = 0; i < this.content.length; i++) {
              if (this.content[i].key === contentKey) {
                const item = {
                  ...this.content[i],
                  ignored: true,
                }
                runInAction(() => {
                  console.log(item);
                  this.content.splice(i, 1, item);
                });
                break;
              }
            }
            resolve();
          }).catch((error) => {
        reject(error);
      });
    })
  }

  @action
  async unIgnoreContent(contentKey: string): Promise<any> {
    return new Promise((resolve, reject) => {
      unIgnoreMedia(contentKey)
        .then(() => {
          for (let i = 0; i < this.content.length; i++) {
            if (this.content[i].key === contentKey) {
              const item = {
                ...this.content[i],
                ignored: false,
              }
              runInAction(() => {
                console.log(item);
                this.content.splice(i, 1, item);
              });
              break;
            }
          }
          resolve();
        }).catch((error) => {
        reject(error);
      });
    })
  }

  loadDupeContent(): void {
    // iterates over the dupes endpoint until there is no data returned
    this.loading = true;
    this.loadingFailed = false;
    this.loadingError = null;
    this.setContent([]);

    let page: number = 1;
    let pageSize: number = PAGE_SIZE;
    let combinedData: Array<any> = [];

    // make PAGE_SIZE requests in parallel
    const fetchData = async () => {
      const requests = [];
      for (let i = 0; i < pageSize; i++) {
        requests.push(getDupeContent(page + i));
      }
      const results = await Promise.all(requests);
      let anyPagesEmpty = false;
      results.forEach((result) => {
        combinedData = combinedData.concat(result.data);
        if (result.data.length == 0) {
          anyPagesEmpty = true;
        }
      });
      if (anyPagesEmpty) {
        // assume that we have reached the end of the data as ?page=N returns an empty array
        this.setContent(combinedData);
        this.loading = false;
      } else {
        page += pageSize;
        fetchData();
      }
    };

    fetchData().catch((error) => {
      this.loading = false;
      this.loadingFailed = true;
      if (error.response?.data?.error) {
        this.loadingError = new Error(error.response?.data?.error);
      }
    });
  }

  loadSampleMovies(): void {
    this.loadContent(getSampleContent);
  }
}

export function newContentStore(): ContentStore {
  return new ContentStore();
}

export function newContentStoreContext(): Context<ContentStore> {
  return React.createContext<ContentStore>(newContentStore());
}

export const contentContext = newContentStoreContext();
