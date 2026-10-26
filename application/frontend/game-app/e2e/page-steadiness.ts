import { Page } from '@playwright/test';

/** The tops of the elements a page recorded, in the document, by their selector */
type Tops = Record<string, number[]>;

/**
 * Records in the page, at each frame, the top of each element in the document, as laid out: an animation moving it (a
 * table shaking) moves nothing. Run in the page, it holds all its code
 * @param selectors the elements to keep in place, the first one of each selector
 */
function recordTops(selectors: string[]): void {
    const tops: Tops = Object.fromEntries(selectors.map((selector: string) => [selector, []]));
    const frame = (): void => {
        for (const selector of selectors) {
            let top: number | null = null;
            for (let element: HTMLElement | null = document.querySelector<HTMLElement>(selector); element !== null; element = element.offsetParent as HTMLElement | null) {
                top = (top ?? 0) + element.offsetTop;
            }
            if (top !== null && !tops[selector].includes(top)) {
                tops[selector].push(top);
            }
        }
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
    (globalThis as unknown as { steadyTops: Tops }).steadyTops = tops;
}

/** The page starts recording where these elements lie */
export async function watchSteadiness(page: Page, selectors: ReadonlyArray<string>): Promise<void> {
    await page.evaluate(recordTops, [...selectors]);
}

/** The elements that moved since the page started recording, with the tops they took, a pixel of rounding aside */
export async function movedElements(page: Page): Promise<string[]> {
    const tops: Tops = await page.evaluate(() => (globalThis as unknown as { steadyTops: Tops }).steadyTops);
    return Object.entries(tops)
        .filter(([, values]: [string, number[]]) => Math.max(...values) - Math.min(...values) > 1)
        .map(([selector, values]: [string, number[]]) => `${ selector }: ${ values.join(', ') }`);
}
