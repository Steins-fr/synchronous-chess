import { StringAttributeValue, MapAttributeValue } from 'aws-sdk/clients/dynamodb';

export interface AttributeString {
    S: StringAttributeValue;
}

export interface AttributeMap<T> {
    M: MapAttributeValue & T;
}

export interface AttributeList<T> {
    L: Array<T>;
}

export interface AttributeNumber {
    N: string;
}
