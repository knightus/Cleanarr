import {action, computed, observable} from 'mobx';
import React, {Context} from "react";
import {Content, Media} from "../types";
import {sumMediaSize} from "../util";
import {deleteMedia} from "../util/api";

export class MediaStore {
  @observable.deep
  media: Record<number, Media> = {};

  @observable isDeleting = false;

  @action
  addMedia(media: Media) {
    this.media[media.id] = media;
  }

  @action
  removeMedia(media: Media) {
    delete this.media[media.id];
  }

  @action
  reset() {
    this.media = {};
  }

  // Drop selection entries whose media.id is no longer present in `content`.
  // Plex re-scan / ignore-toggle / upstream delete can invalidate ids; without
  // this, the "Selected: N" pill counts orphans and toasts overstate deletions.
  @action
  reconcileWith(content: Content[]) {
    const liveIds = new Set<number>();
    content.forEach(item => item.media.forEach(m => liveIds.add(m.id)));
    Object.keys(this.media).forEach(idStr => {
      const id = Number(idStr);
      if (!liveIds.has(id)) {
        delete this.media[id];
      }
    });
  }

  deleteMedia(libraryName: string, movieKey: string, media: Media): Promise<any> {
    return new Promise((resolve, reject) => {
      deleteMedia(libraryName, movieKey, media.id)
        .then(() => {
          this.removeMedia(media);
          resolve();
        }).catch((error) => {
          reject(error);
        });
    })
  }

  @computed
  get length(): number {
    return Object.keys(this.media).length;
  }

  @computed
  get totalSizeBytes(): number {
    let total = 0;
    Object.values(this.media).forEach(media => {
      total += sumMediaSize(media);
    });
    return total;
  }
}

export function newMediaStore(): MediaStore {
  return new MediaStore();
}

export function newMediaStoreContext(): Context<MediaStore> {
  return React.createContext<MediaStore>(newMediaStore());
}

export const mediaContext = newMediaStoreContext();
export const deletedMediaContext = newMediaStoreContext();
