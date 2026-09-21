import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
    Auth,
    GoogleAuthProvider,
    User as FirebaseUser,
    createUserWithEmailAndPassword,
    deleteUser,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signInWithPopup,
    signOut,
    updateProfile
} from '@angular/fire/auth';

/** Résultat d'une opération d'authentification, message inclus. */
export interface AuthResult {
    ok: boolean;
    error?: string;
}

/** Identité de l'utilisateur connecté, telle que l'affichent les écrans. */
export interface AuthUser {
    uid: string;
    fullName: string;
    email: string;
    /** 'google' ou 'password' : conditionne le changement de mot de passe. */
    provider: string;
    photoUrl: string | null;
}

/**
 * Authentification par Firebase.
 *
 * Aucun mot de passe ne transite plus par l'application ni par le stockage
 * local : Firebase les détient, et sait envoyer un vrai email de
 * réinitialisation.
 */
@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private auth = inject(Auth);
    private router = inject(Router);

    currentUser = signal<AuthUser | null>(null);

    /**
     * Faux jusqu'à ce que Firebase ait restauré (ou non) la session. Les
     * gardes de route l'attendent, sinon un rechargement de page renverrait
     * sur l'accueil avant que la session soit connue.
     */
    ready = signal(false);

    isAuthenticated = computed(() => this.currentUser() !== null);

    private readyPromise: Promise<void>;

    constructor() {
        let resolveReady: () => void;
        this.readyPromise = new Promise<void>(resolve => { resolveReady = resolve; });

        onAuthStateChanged(this.auth, (user: FirebaseUser | null) => {
            this.currentUser.set(user ? toAuthUser(user) : null);
            if (!this.ready()) {
                this.ready.set(true);
                resolveReady!();
            }
        });
    }

    /** Attend la première réponse de Firebase sur l'état de session. */
    whenReady(): Promise<void> {
        return this.readyPromise;
    }

    // ------------------------------------------------------------ connexion

    async loginWithGoogle(): Promise<AuthResult> {
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(this.auth, provider);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: describe(error) };
        }
    }

    async login(email: string, password: string): Promise<AuthResult> {
        try {
            await signInWithEmailAndPassword(this.auth, email, password);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: describe(error) };
        }
    }

    async register(fullName: string, email: string, password: string): Promise<AuthResult> {
        try {
            const credential = await createUserWithEmailAndPassword(this.auth, email, password);
            await updateProfile(credential.user, { displayName: fullName });
            this.currentUser.set(toAuthUser(credential.user, fullName));
            return { ok: true };
        } catch (error) {
            return { ok: false, error: describe(error) };
        }
    }

    /** Envoie un vrai email de réinitialisation, par Firebase. */
    async sendPasswordReset(email: string): Promise<AuthResult> {
        try {
            await sendPasswordResetEmail(this.auth, email);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: describe(error) };
        }
    }

    async logout(): Promise<void> {
        await signOut(this.auth);
        await this.router.navigate(['/']);
    }

    /**
     * Supprime le compte Firebase. Les données du document utilisateur sont
     * effacées séparément, avant l'appel, par l'écran qui le demande.
     */
    async deleteAccount(): Promise<AuthResult> {
        const user = this.auth.currentUser;
        if (!user) {
            return { ok: false, error: 'Aucun compte connecté.' };
        }
        try {
            await deleteUser(user);
            await this.router.navigate(['/']);
            return { ok: true };
        } catch (error) {
            return { ok: false, error: describe(error) };
        }
    }

    /** Met à jour le nom affiché côté Firebase, en plus du profil applicatif. */
    async updateDisplayName(fullName: string): Promise<void> {
        const user = this.auth.currentUser;
        if (!user) return;
        await updateProfile(user, { displayName: fullName });
        this.currentUser.update(current => (current ? { ...current, fullName } : current));
    }
}

// --------------------------------------------------------------------------

function toAuthUser(user: FirebaseUser, fallbackName?: string): AuthUser {
    return {
        uid: user.uid,
        fullName: user.displayName || fallbackName || (user.email ?? '').split('@')[0],
        email: user.email ?? '',
        provider: user.providerData[0]?.providerId ?? 'password',
        photoUrl: user.photoURL ?? null
    };
}

/** Traduit les codes d'erreur Firebase en phrases lisibles. */
function describe(error: unknown): string {
    const code = (error as { code?: string })?.code ?? '';

    switch (code) {
        case 'auth/invalid-email':
            return "Cette adresse email n'est pas valide.";
        case 'auth/missing-password':
            return 'Renseignez votre mot de passe.';
        case 'auth/weak-password':
            return 'Le mot de passe doit faire au moins 6 caractères.';
        case 'auth/email-already-in-use':
            return 'Un compte existe déjà avec cet email. Essayez de vous connecter.';
        case 'auth/invalid-credential':
        case 'auth/wrong-password':
        case 'auth/user-not-found':
            return 'Email ou mot de passe incorrect.';
        case 'auth/operation-not-allowed':
            return 'La connexion par email doit d’abord être activée dans la console Firebase (Authentication → Sign-in method).';
        case 'auth/user-disabled':
            return 'Ce compte a été désactivé.';
        case 'auth/too-many-requests':
            return 'Trop de tentatives. Réessayez dans quelques minutes.';
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return 'Connexion Google annulée.';
        case 'auth/popup-blocked':
            return 'La fenêtre Google a été bloquée par le navigateur. Autorisez les fenêtres surgissantes.';
        case 'auth/account-exists-with-different-credential':
            return 'Cet email est déjà utilisé avec une autre méthode de connexion.';
        case 'auth/requires-recent-login':
            return 'Par sécurité, reconnectez-vous avant de supprimer le compte.';
        case 'auth/network-request-failed':
            return 'Pas de connexion réseau.';
        case 'auth/unauthorized-domain':
            return "Ce domaine n'est pas autorisé dans la console Firebase.";
        default:
            return code ? `Échec de l'opération (${code}).` : "Échec de l'opération.";
    }
}
