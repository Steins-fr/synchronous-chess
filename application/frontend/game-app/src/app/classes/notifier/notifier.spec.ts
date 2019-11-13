import Notifier from './notifier';

describe('Notifier', () => {
    it('should create an instance', () => {
        expect(new Notifier<any, any>()).toBeTruthy();
    });

    it('should add/remove a new follower into a subject', () => {
        // Given
        const subjectType: string = 'subject1';
        const notifier: Notifier<string, string> = new Notifier<string, string>();
        const fakeIdentity1: object = {};
        const fakeIdentity2: object = {};

        // When
        const nbFollowingInit: number = notifier.followingLength(subjectType);
        notifier.follow(subjectType, fakeIdentity1, undefined);
        notifier.follow(subjectType, fakeIdentity2, undefined);
        const nbFollowing2: number = notifier.followingLength(subjectType);

        notifier.unfollow(subjectType, fakeIdentity1);
        const nbFollowing1: number = notifier.followingLength(subjectType);

        // Then
        expect(nbFollowingInit).toEqual(0);
        expect(nbFollowing2).toEqual(2);
        expect(nbFollowing1).toEqual(1);
    });

    it('should notify the followers of a subject', () => {
        // Given
        const subjectType: string = 'subject1';
        const fakeSubjectType: string = 'fakeSubject1';
        const notifier: Notifier<string, string> = new Notifier<string, string>();
        const fakeIdentity1: object = {};
        const fakeIdentity2: object = {};
        const message: string = 'message';
        const fakeMessage: string = 'fakeMessage';

        // When
        let notification1: string = '';
        let notification2: string = '';
        notifier.follow(subjectType, fakeIdentity1, (notification: string) => notification1 = notification);
        notifier.follow(subjectType, fakeIdentity2, (notification: string) => notification2 = notification);
        notifier.notify(subjectType, message);
        notifier.notify(fakeSubjectType, fakeMessage);

        // Then
        expect(notification1).toEqual(message);
        expect(notification2).toEqual(message);
    });
});
