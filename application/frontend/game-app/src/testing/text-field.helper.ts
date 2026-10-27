/** The field of a form component of this label, found as a player finds it: by the text of its label */
function labelledField(root: ParentNode, selector: string, label: string): Element {
    const field: Element | undefined = [...root.querySelectorAll(selector)]
        .find((candidate: Element) => (candidate.querySelector('mat-label') as Element).textContent.trim() === label);

    if (field === undefined) {
        throw new Error(`No text field labelled '${ label }'`);
    }

    return field;
}

/** The input of the text field of this label, found as a player finds it: by the text of its label */
export function textFieldInput(root: ParentNode, label: string): HTMLInputElement {
    return labelledField(root, 'app-text-field', label).querySelector('input') as HTMLInputElement;
}

/** The text area of the text area field of this label, found by the text of its label */
export function textAreaFieldInput(root: ParentNode, label: string): HTMLTextAreaElement {
    return labelledField(root, 'app-text-area-field', label).querySelector('textarea') as HTMLTextAreaElement;
}
