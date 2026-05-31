/**
 * Helpful Utilities
 */
import {Media} from "../types";

/**
 * Total size of all Parts in a given copy of Media
 * @param media
 * @return total size in bytes
 */
export const sumMediaSize = (media: Media): number => {
  return media.parts
    .map(value => value.size)
    .reduce((sum, x) => (sum + x))
};

/**
 * Last path segment of a file path (handles both / and \ separators).
 * Plex stores full paths in `media.parts[].file`; the confirm dialog only
 * needs the filename so the user can tell which release they marked.
 * @param path full file path
 * @return the filename, or the original string if it has no separators
 */
export const fileBasename = (path: string): string => {
  if (!path) return '';
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || path;
};

/**
 * Bytes to a human readable string
 * @param bytes
 */
export const bytesToSize = (bytes: number): string => {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return 'n/a';
  const i = parseInt(String(Math.floor(Math.log(bytes) / Math.log(1024))), 10);
  if (i === 0) return `${bytes} ${sizes[i]}`;
  return `${(bytes / (1024 ** i)).toFixed(1)} ${sizes[i]}`;
};
