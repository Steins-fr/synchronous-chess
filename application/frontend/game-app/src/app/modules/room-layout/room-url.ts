import { Params, Router, UrlTree } from '@angular/router';

/** The query parameter of the URL of a page holding the id of its room: `?room=room-1%23004512`, its `#` encoded */
export const ROOM_PARAM: string = 'room';

/** The id of the room in the URL of the page, without the blanks of a link copied (an id has none), null without one */
export function roomInUrl(router: Router): string | null {
    const roomId: string | undefined = router.parseUrl(router.url).queryParamMap.get(ROOM_PARAM)?.trim();
    return roomId === undefined || roomId === '' ? null : roomId;
}

/**
 * Shows the id of the room in the URL of the page, or removes it, in place: no new entry in the history, the page reused.
 * Not while the app navigates: the player leaving the page, it would cancel the navigation
 * @param roomId null to remove it
 */
export function showRoomInUrl(router: Router, roomId: string | null): void {
    const url: UrlTree = router.parseUrl(router.url);

    if (url.queryParamMap.get(ROOM_PARAM) === roomId || router.currentNavigation() !== null) {
        return;
    }

    const params: Params = { ...url.queryParams };
    delete params[ROOM_PARAM];
    url.queryParams = roomId === null ? params : { ...params, [ROOM_PARAM]: roomId };
    void router.navigateByUrl(url, { replaceUrl: true });
}
