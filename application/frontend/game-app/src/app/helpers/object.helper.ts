export const objectHasValue = <Values>(obj: Record<string, Values>, value: Values): boolean => {
    return Object.values(obj).includes(value);
};
