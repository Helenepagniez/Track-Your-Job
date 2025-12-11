import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LocalStorageService, User } from './local-storage.service';

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

    register(fullName: string, email: string, password: string): boolean {
        // Check if a user already exists
        const existingUser = this.localStorageService.getCurrentUser();
        if (existingUser) {
            alert('Un utilisateur est déjà enregistré. Veuillez vous déconnecter d\'abord.');
            return false;
        }

        const user: User = {
            id: this.generateId(),
            fullName,
            email,
            password,
            authMethod: 'email',
            createdAt: new Date()
        };

        // Save user and log in
        this.setCurrentUser(user);
        return true;
    }

    login(email: string, password: string): boolean {
        const user = this.localStorageService.getCurrentUser();

        if (!user) {
            alert('Aucun utilisateur enregistré');
            return false;
        }

        if (user.email !== email || user.password !== password) {
            alert('Email ou mot de passe incorrect');
            return false;
        }

        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        return true;
    }

    loginWithGoogle(): boolean {
        // Check if a user already exists
        const existingUser = this.localStorageService.getCurrentUser();
        if (existingUser) {
            alert('Un utilisateur est déjà enregistré. Veuillez vous déconnecter d\'abord.');
            return false;
        }

        // Mock Google login - create a user
        const user: User = {
            id: this.generateId(),
            fullName: 'Utilisateur Google',
            email: 'user@gmail.com',
            password: '',
            authMethod: 'google',
            createdAt: new Date()
        };

        this.setCurrentUser(user);
        return true;
    }

    logout() {
        this.currentUser.set(null);
        this.isAuthenticated.set(false);
        this.localStorageService.updateCurrentUser(null);
        this.router.navigate(['/']);
    }

    private setCurrentUser(user: User) {
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        this.localStorageService.updateCurrentUser(user);
    }

    private generateId(): string {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    updateUserProfile(updates: Partial<User>) {
        const user = this.currentUser();
        if (user) {
            const updatedUser = { ...user, ...updates };
            this.currentUser.set(updatedUser);
            this.localStorageService.updateCurrentUser(updatedUser);
        }
    }

    deleteUser() {
        const user = this.currentUser();
        if (user) {
            // Clear all application data from localStorage
            this.localStorageService.clearAllData();

            // Reload the page to reset all services
            window.location.href = '/';
        }
    }
}
