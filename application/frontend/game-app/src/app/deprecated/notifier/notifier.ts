type NotifyCallback<Data> = (data: Data) => void;

interface Follower {
    reference: object;
    notify: NotifyCallback<any>;
}

type Followers = Array<Follower>;

export interface NotifierFlow<T> {
    follow: <Callback>(subjectType: T, who: object, callback: NotifyCallback<Callback>) => void;
    unfollow: (subjectType: T, who: object) => void;
}

/** @deprecated replace by subjects instead */
export default class Notifier<T, U> implements NotifierFlow<T> {
    private readonly followerSubjects: Map<T, Followers> = new Map<T, Followers>();

    public notify(subjectType: T, message: U): void {
        if (this.followerSubjects.has(subjectType)) {
            const followers: Followers | undefined = this.followerSubjects.get(subjectType);

            if (!followers) {
                return;
            }

            followers.forEach((follower: Follower) => follower.notify(message));
        }
    }

    public follow<Callback>(subjectType: T, who: object, callback: NotifyCallback<Callback>): void {
        const followers: Followers = this.followerSubjects.get(subjectType) ?? [];
        followers.push({
            reference: who,
            notify: callback
        });
        this.followerSubjects.set(subjectType, followers);
    }

    public unfollow(subjectType: T, who: object): void {
        if (this.followerSubjects.has(subjectType)) {
            let followers: Followers | undefined = this.followerSubjects.get(subjectType);

            if (!followers) {
                return;
            }

            followers = followers.filter((follower: Follower) => follower.reference !== who);
            this.followerSubjects.set(subjectType, followers);
        }
    }

    public followingLength(subjectType: T): number {
        const followers: Followers | undefined = this.followerSubjects.get(subjectType);

        if (!followers) {
            return 0;
        }
        return followers.length;
    }
}
