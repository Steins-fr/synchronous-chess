type NotifyCallback<U> = (data: U) => void;

interface Follower<U> {
    reference: object;
    notify: NotifyCallback<U>;
}

type Followers<U> = Array<Follower<U>>;

export interface NotifierFlow<T, U> {
    follow: (subjectType: T, who: object, callback: NotifyCallback<U>) => void;
    unfollow: (subjectType: T, who: object) => void;
}

export default class Notifier<T, U> implements NotifierFlow<T, U> {
    private readonly followerSubjects: Map<T, Followers<U>> = new Map<T, Followers<U>>();

    public notify(subjectType: T, message: U): void {
        if (this.followerSubjects.has(subjectType)) {
            const followers: Followers<U> = this.followerSubjects.get(subjectType);
            followers.forEach((follower: Follower<U>) => follower.notify(message));
        }
    }

    public follow(subjectType: T, who: object, callback: NotifyCallback<U>): void {
        let followers: Followers<U> = [];
        if (this.followerSubjects.has(subjectType)) {
            followers = this.followerSubjects.get(subjectType);
        }
        followers.push({
            reference: who,
            notify: callback
        });
        this.followerSubjects.set(subjectType, followers);
    }

    public unfollow(subjectType: T, who: object): void {
        if (this.followerSubjects.has(subjectType)) {
            let followers: Followers<U> = this.followerSubjects.get(subjectType);
            followers = followers.filter((follower: Follower<U>) => follower.reference !== who);
            this.followerSubjects.set(subjectType, followers);
        }
    }

    public followingLength(subjectType: T): number {
        if (this.followerSubjects.has(subjectType) === false) {
            return 0;
        }
        return this.followerSubjects.get(subjectType).length;
    }
}
