import { Call, CallKind, ContrabandRules, ContrabandVariant, trunkLimit } from './contraband-rules';

/** How a game ended */
export enum CustomsOutcome {
    /** The inspector passed: the contents went through, nothing for an empty trunk or an iron bar */
    PASSED = 'passed',
    /** The inspector doubted an empty trunk: it pays the smuggler half of its doubt */
    EMPTY_DOUBT = 'emptyDoubt',
    /** The inspector doubted the contents or more, or checked a gold bar: it seizes them */
    SEIZED = 'seized',
    /** The inspector doubted less than the contents: they went through, and it pays the smuggler half of its doubt */
    SLIPPED = 'slipped',
    /** The inspector checked an iron bar: it pays the smuggler a gold bar */
    IRON_CHECKED = 'ironChecked',
    /** The smuggler did not reveal its trunk, in time or as packed: the most it could hold is seized */
    WITHHELD = 'withheld',
}

/** The money a game moved, in millions */
export interface Movement {
    readonly outcome: CustomsOutcome;
    /** Reaches the account of the smuggler */
    readonly smuggled: number;
    /** Reaches the account of the inspector */
    readonly seized: number;
    /** Paid by the inspector to the smuggler */
    readonly indemnity: number;
    /** Leaves the ATM of the smuggler: what was smuggled or seized */
    readonly fromAtm: number;
}

function movement(outcome: CustomsOutcome, moved: { readonly smuggled?: number; readonly seized?: number; readonly indemnity?: number }): Movement {
    const { smuggled = 0, seized = 0, indemnity = 0 } = moved;
    return { outcome, smuggled, seized, indemnity, fromAtm: smuggled + seized };
}

/**
 * The money a call moves, the trunk revealed: a pass lets the contents through; a doubt seizes contents up to its
 * amount, else the inspector pays half of it, the contents going through; a check seizes a gold bar, else the inspector
 * pays one. The call is one of the variant of the trunk
 *
 * @param contents the money of the trunk: 0 for an iron bar
 */
export function settleCall(rules: ContrabandRules, contents: number, call: Call): Movement {
    switch (call.kind) {
        case CallKind.PASS:
            return movement(CustomsOutcome.PASSED, { smuggled: contents });
        case CallKind.CHECK:
            return contents > 0 ? movement(CustomsOutcome.SEIZED, { seized: contents }) : movement(CustomsOutcome.IRON_CHECKED, { indemnity: rules.goldBar });
        case CallKind.DOUBT:
            if (contents === 0) {
                return movement(CustomsOutcome.EMPTY_DOUBT, { indemnity: call.amount / 2 });
            }
            return call.amount >= contents
                ? movement(CustomsOutcome.SEIZED, { seized: contents })
                : movement(CustomsOutcome.SLIPPED, { smuggled: contents, indemnity: call.amount / 2 });
    }
}

/**
 * The money a trunk not revealed moves, in time, as packed or by the rules: the most it could hold is seized, the call
 * aside, so withholding never pays. In the classic variant the limit of the trunk; in the Gold Rush a gold bar, nothing
 * once the ATM holds none
 */
export function withheldMovement(rules: ContrabandRules, variant: ContrabandVariant, atm: number): Movement {
    if (variant === ContrabandVariant.GOLD_RUSH) {
        return movement(CustomsOutcome.WITHHELD, { seized: atm >= rules.goldBar ? rules.goldBar : 0 });
    }
    return movement(CustomsOutcome.WITHHELD, { seized: trunkLimit(rules, atm) });
}
