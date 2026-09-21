import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LocalStorageService, User } from './local-storage.service';

/** Résultat d'une tentative d'authentification, message inclus. */
export interface AuthResult {
    ok: boolean;
    error?: string;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    currentUser = signal<User | null>(null);
    isAuthenticated = signal<boolean>(false);

    constructor(
        private router: Router,
        private localStorageService: LocalStorageService
    ) {
        this.loadUserFromStorage();
    }

    private loadUserFromStorage() {
        const user = this.localStorageService.getCurrentUser();
        if (user) {
            this.currentUser.set(user);
            this.isAuthenticated.set(true);
        }
    }

    /**
     * Relit l'identité depuis le stockage. Appelé après une écriture du profil
     * faite ailleurs, pour que l'en-tête et les écrans restent d'accord.
     */
    refreshCurrentUser() {
        const user = this.localStorageService.getCurrentUser();
        if (user) {
            this.currentUser.set(user);
        }
    }

    register(fullName: string, email: string, password: string): AuthResult {
        if (this.localStorageService.emailExists(email)) {
            return { ok: false, error: 'Un compte existe déjà avec cet email.' };
        }

        const user: User = {
            id: this.generateId(),
            fullName,
            email,
            password,
            authMethod: 'email',
            createdAt: new Date()
        };

        // Register user in localStorage
        this.localStorageService.registerUser(user);
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        return { ok: true };
    }

    login(email: string, password: string): AuthResult {
        const user = this.localStorageService.findUserByEmail(email);

        if (!user || user.password !== password) {
            return { ok: false, error: 'Email ou mot de passe incorrect.' };
        }

        // Set as current user in localStorage
        this.localStorageService.setCurrentUser(user);
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        return { ok: true };
    }

    /**
     * Réinitialisation locale du mot de passe.
     *
     * Il n'y a pas d'envoi d'email : les données vivent dans ce navigateur et
     * rien n'est chiffré, donc quiconque l'ouvre y a déjà accès. Cela ne
     * protège de rien, mais cela évite d'être enfermé dehors. Un vrai
     * « mot de passe oublié » par email arrivera avec Firebase Auth.
     */
    resetPasswordLocally(email: string, newPassword: string): AuthResult {
        if (newPassword.length < 6) {
            return { ok: false, error: 'Le mot de passe doit faire au moins 6 caractères.' };
        }
        if (!this.localStorageService.updatePasswordByEmail(email, newPassword)) {
            return { ok: false, error: 'Aucun compte avec cet email dans ce navigateur.' };
        }
        return { ok: true };
    }

    logout() {
        this.localStorageService.logout();
        this.currentUser.set(null);
        this.isAuthenticated.set(false);
        this.router.navigate(['/']);
    }

    private generateId(): string {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    updateUserProfile(updates: Partial<User>) {
        const user = this.currentUser();
        if (user) {
            const updatedUser = { ...user, ...updates };
            this.currentUser.set(updatedUser);
            this.localStorageService.updateCurrentUser(updates);
        }
    }

    deleteUser() {
        const user = this.currentUser();
        if (user) {
            // Delete current user data
            this.localStorageService.deleteCurrentUser();

            // Reload the page to reset all services
            window.location.href = '/';
        }
    }
}
