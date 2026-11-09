import { Apple, EdenRules } from './eden-rules';

/** The line of the table of gains a count fell on: the keys of its texts end with it */
export enum AppleOutcome {
    /** No apple counted */
    NO_VOTE = 'noVote',
    /** No red apple, as many gold as silver ones: nobody wins or loses */
    TIE = 'tie',
    /** No red apple, all of one color: every apple loses */
    ONE_COLOR = 'oneColor',
    /** No red apple: the color of the most apples wins, the other one loses */
    MAJORITY = 'majority',
    /** Only red apples: every apple wins */
    ALL_RED = 'allRed',
    /** A single red apple among gold or silver ones: it loses the most, the others win */
    LONE_RED = 'loneRed',
    /** A single gold or silver apple among red ones: it wins the most, the red ones lose */
    LONE_APPLE = 'loneApple',
    /** Two red apples or more, two gold or silver ones or more: the red ones lose, the others win */
    MIXED = 'mixed',
}

export interface CastApple {
    readonly player: number;
    readonly apple: Apple;
}

/** What a player won or lost on a round */
export interface RoundGain {
    readonly player: number;
    readonly gain: number;
}

export interface AppleCount {
    readonly outcome: AppleOutcome;
    /** The player of the lone apple, red or not: none but on these lines */
    readonly lone: number | null;
    /** The color of the most apples, or the only one: none but on these lines */
    readonly color: Apple | null;
    /** The gain of each apple, in the order of the apples */
    readonly gains: ReadonlyArray<Readonly<RoundGain>>;
}

/** The line of the count, its lines tested in this order: a single red apple against a single other one is a lone red */
function outcomeOf(gold: number, silver: number, red: number): AppleOutcome {
    if (gold + silver + red === 0) {
        return AppleOutcome.NO_VOTE;
    }
    if (red === 0) {
        if (gold === silver) {
            return AppleOutcome.TIE;
        }
        return gold === 0 || silver === 0 ? AppleOutcome.ONE_COLOR : AppleOutcome.MAJORITY;
    }
    if (gold + silver === 0) {
        return AppleOutcome.ALL_RED;
    }
    if (red === 1) {
        return AppleOutcome.LONE_RED;
    }
    return gold + silver === 1 ? AppleOutcome.LONE_APPLE : AppleOutcome.MIXED;
}

function gainOf(rules: EdenRules, outcome: AppleOutcome, apple: Apple, color: Apple | null): number {
    const red: boolean = apple === Apple.RED;
    switch (outcome) {
        case AppleOutcome.ONE_COLOR:
            return -rules.gain;
        case AppleOutcome.MAJORITY:
            return apple === color ? rules.gain : -rules.gain;
        case AppleOutcome.ALL_RED:
            return rules.gain;
        case AppleOutcome.LONE_RED:
            return red ? -rules.loneRedLoss : rules.gain;
        case AppleOutcome.LONE_APPLE:
            return red ? -rules.gain : rules.loneGain;
        case AppleOutcome.MIXED:
            return red ? -rules.gain : rules.gain;
        default:
            // A tie: the line without any apple gives no gain to count
            return 0;
    }
}

/** The apples of a round counted, by the table of gains of the Garden of Eden */
export function countApples(rules: EdenRules, apples: ReadonlyArray<Readonly<CastApple>>): AppleCount {
    const of = (apple: Apple): ReadonlyArray<Readonly<CastApple>> => apples.filter((cast: Readonly<CastApple>) => cast.apple === apple);
    const [gold, silver, red] = [of(Apple.GOLD), of(Apple.SILVER), of(Apple.RED)];
    const outcome: AppleOutcome = outcomeOf(gold.length, silver.length, red.length);
    const lone: number | null = ((): number | null => {
        switch (outcome) {
            case AppleOutcome.LONE_RED:
                return red[0].player;
            case AppleOutcome.LONE_APPLE:
                return [...gold, ...silver][0].player;
            default:
                return null;
        }
    })();
    const most: Apple = gold.length > silver.length ? Apple.GOLD : Apple.SILVER;
    const color: Apple | null = outcome === AppleOutcome.MAJORITY || outcome === AppleOutcome.ONE_COLOR ? most : null;
    const gains: RoundGain[] = apples.map((cast: Readonly<CastApple>): RoundGain =>
        ({ player: cast.player, gain: gainOf(rules, outcome, cast.apple, color) }));

    return { outcome, lone, color, gains };
}
