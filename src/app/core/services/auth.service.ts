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
        // Check if email already exists
        if (this.localStorageService.emailExists(email)) {
            alert('Un compte avec cet email existe déjà');
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

        // Register user in localStorage
        this.localStorageService.registerUser(user);
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        return true;
    }

    login(email: string, password: string): boolean {
        const user = this.localStorageService.findUserByEmail(email);

        if (!user) {
            alert('Email ou mot de passe incorrect');
            return false;
        }

        if (user.password !== password) {
            alert('Email ou mot de passe incorrect');
            return false;
        }

        // Set as current user in localStorage
        this.localStorageService.setCurrentUser(user);
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        return true;
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
