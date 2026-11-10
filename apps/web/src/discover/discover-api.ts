import {
  loadDiscover,
  loadDiscoverDetails,
  loadWatchProviders,
  loadWishlist,
  searchDiscover,
  setWishlisted,
} from '../api.js';

/** The server calls of UC26; the page and the sheet take it as a prop so tests inject fakes. */
export interface DiscoverApi {
  readonly list: typeof loadDiscover;
  readonly search: typeof searchDiscover;
  readonly details: typeof loadDiscoverDetails;
  readonly wishlist: typeof loadWishlist;
  readonly setWishlisted: typeof setWishlisted;
  readonly providers: typeof loadWatchProviders;
}

export const discoverApi: DiscoverApi = {
  list: loadDiscover,
  search: searchDiscover,
  details: loadDiscoverDetails,
  wishlist: loadWishlist,
  setWishlisted,
  providers: loadWatchProviders,
};
