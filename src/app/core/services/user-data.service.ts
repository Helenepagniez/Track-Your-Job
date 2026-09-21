import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Firestore, doc, setDoc } from '@angular/fire/firestore';
import { onSnapshot } from 'firebase/firestore';
import { Profile } from '../models/job-search.models';
import { AuthService, AuthUser } from './auth.service';
import { SCHEMA_VERSION, UserData, emptyUserData } from './storage/app-data';
import { normalizeUserData } from './storage/migrate';

/** Document Firestore où tient l'ensemble des données d'un utilisateur. */
interface StoredDocument extends Omit<UserData, 'tasks'> {
    schemaVersion: number;
    /** Les dates y sont des chaînes ISO : Firestore ne rend pas des `Date`. */
    tasks: (Omit<UserData['tasks'][number], 'dueDate'> & { dueDate: string })[];
}

/**
 * Détient le document `users/{uid}` et l'expose comme un signal.
 *
 * Un seul service écrit ce document : le store et le service de tâches passent
 * tous les deux par `update()`. C'est ce qui évite que deux écrivains
 * s'écrasent, comme cela arrivait avec le localStorage.
 *
 * Firestore garde un cache local, donc l'application fonctionne hors ligne et
 * se resynchronise au retour du réseau. `onSnapshot` fait le reste : une
 * modification faite sur un autre appareil arrive ici sans rechargement.
 */
@Injectable({ providedIn: 'root' })
export class UserDataService {
    private firestore = inject(Firestore);
    private auth = inject(AuthService);

    private state = signal<UserData | null>(null);
    private detach: (() => void) | null = null;

    /** Faux jusqu'à la première réponse de Firestore pour ce compte. */
    ready = signal(false);
    /** Renseigné quand une écriture a échoué : l'interface peut le dire. */
    error = signal('');

    data = computed<UserData | null>(() => this.state());

    constructor() {
        effect(() => {
            const user = this.auth.currentUser();
            untracked(() => this.listenTo(user));
        }, { allowSignalWrites: true });
    }

    // ------------------------------------------------------------- lecture

    private listenTo(user: AuthUser | null): void {
        this.detach?.();
        this.detach = null;
        this.error.set('');

        if (!user) {
            this.state.set(null);
            this.ready.set(false);
            return;
        }

        const reference = doc(this.firestore, 'users', user.uid);

        this.detach = onSnapshot(
            reference,
            snapshot => {
                if (snapshot.exists()) {
                    this.state.set(fromDocument(snapshot.data() as StoredDocument));
                } else {
                    // Premier accès : on crée le document du compte.
                    const fresh = emptyUserData(profileOf(user));
                    this.state.set(fresh);
                    void this.persist(user.uid, fresh);
                }
                this.ready.set(true);
            },
            failure => {
                this.error.set(readableError(failure));
                this.ready.set(true);
            }
        );
    }

    // ------------------------------------------------------------ écriture

    /**
     * Applique une modification puis l'enregistre. Le signal est mis à jour
     * tout de suite : l'interface ne clignote pas en attendant le réseau.
     */
    update(mutate: (data: UserData) => UserData): void {
        const current = this.state();
        const user = this.auth.currentUser();
        if (!current || !user) return;

        const next = mutate(current);
        this.state.set(next);
        void this.persist(user.uid, next);
    }

    /** Remplace tout le contenu : import d'une sauvegarde, ou reprise locale. */
    replaceAll(data: UserData): void {
        const user = this.auth.currentUser();
        if (!user) return;

        const next: UserData = { ...data, profile: { ...data.profile, id: user.uid } };
        this.state.set(next);
        void this.persist(user.uid, next);
    }

    /** Vide le compte sans le supprimer : utilisé avant la suppression. */
    async clear(): Promise<void> {
        const user = this.auth.currentUser();
        if (!user) return;
        const fresh = emptyUserData(profileOf(user));
        this.state.set(fresh);
        await this.persist(user.uid, fresh);
    }

    private async persist(uid: string, data: UserData): Promise<void> {
        try {
            await setDoc(doc(this.firestore, 'users', uid), toDocument(data));
            this.error.set('');
        } catch (failure) {
            this.error.set(readableError(failure));
        }
    }

    /** Contenu exportable, lisible et réimportable. */
    exportJson(): string {
        return JSON.stringify(
            { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: this.state() },
            null,
            2
        );
    }
}

// --------------------------------------------------------------------------

function profileOf(user: AuthUser): Profile {
    return {
        id: user.uid,
        fullName: user.fullName,
        email: user.email,
        createdAt: new Date().toISOString()
    };
}

/** Firestore ne rend pas des `Date` : on écrit les échéances en ISO. */
function toDocument(data: UserData): StoredDocument {
    return {
        ...data,
        schemaVersion: SCHEMA_VERSION,
        tasks: data.tasks.map(task => ({
            ...task,
            dueDate: new Date(task.dueDate).toISOString()
        }))
    };
}

function fromDocument(document: StoredDocument): UserData {
    return normalizeUserData({
        ...document,
        tasks: (document.tasks ?? []).map(task => ({
            ...task,
            dueDate: new Date(task.dueDate)
        }))
    } as unknown as UserData);
}

function readableError(failure: unknown): string {
    const code = (failure as { code?: string })?.code ?? '';
    if (code === 'permission-denied') {
        return "Accès refusé par les règles Firestore. Vérifiez qu'elles sont bien publiées.";
    }
    if (code === 'unavailable') {
        return 'Pas de connexion : vos modifications seront envoyées au retour du réseau.';
    }
    return code ? `Synchronisation impossible (${code}).` : 'Synchronisation impossible.';
}
