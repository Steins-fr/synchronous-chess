/**
 * @description
 * Get a spy for a getter property of a spy object.
 *
 * Jasmine does not provide a method nor a Type to spy on a getter property of a spy object.
 *
 * Jasmine only provides direct getter/setter configuration in the `createSpyObj` method, but they are resolved at the time of the spy creation,
 * so it is not possible to change the return value of a getter property after the spy object is created.
 *
 * But without defining the getter property in the `createSpyObj` method, it permits to retrieve the property descriptor of the getter property and define the spy.
 *
 * @see https://jasmine.github.io/tutorials/spying_on_properties
 * @usage ```ts
 * spyObj = jasmine.createSpyObj<CLASS>(
 *             'className',
 *             ['method1', 'method2'],
 *             ['property1', 'property2']
 *         );
 *
 * const getterSpy = getGetterSpy(instance, 'propertyName');
 * getterSpy.and.returnValue('value');
 * ```
 */
export function getGetterSpy<Class>(instance: Class, propertyName: keyof Class): jasmine.Spy {
    const spy = Object.getOwnPropertyDescriptor(instance, propertyName);

    if (typeof spy !== 'object') {
        throw new Error(`Property ${ String(propertyName) } does not exist`);
    }

    if (!('get' in spy)) {
        throw new Error(`Property ${ String(propertyName) } is not a getter`);
    }

    return spy.get as unknown as jasmine.Spy;
}
