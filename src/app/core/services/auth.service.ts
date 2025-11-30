import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface User {
    id: string;
    fullName: string;
    email: string;
    authMethod: 'email' | 'google';
    createdAt: Date;
    title?: string;
    location?: string;
    bio?: string;
    skills?: string[];
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly STORAGE_KEY = 'track_your_job_user';
    private readonly AUTH_TOKEN_KEY = 'track_your_job_token';

    currentUser = signal<User | null>(null);
    isAuthenticated = signal<boolean>(false);

    constructor(private router: Router) {
        this.loadUserFromStorage();
    }

    private loadUserFromStorage() {
        const userJson = localStorage.getItem(this.STORAGE_KEY);
        const token = localStorage.getItem(this.AUTH_TOKEN_KEY);

        if (userJson && token) {
            const user = JSON.parse(userJson);
            this.currentUser.set(user);
            this.isAuthenticated.set(true);
        }
    }

    register(fullName: string, email: string, password: string): boolean {
        // Check if user already exists
        const existingUsers = this.getAllUsers();
        if (existingUsers.some(u => u.email === email)) {
            alert('Un compte avec cet email existe déjà');
            return false;
        }

        const user: User = {
            id: this.generateId(),
            fullName,
            email,
            authMethod: 'email',
            createdAt: new Date()
        };

        // Store password separately (in real app, this would be hashed on backend)
        const credentials = {
            email,
            password
        };

        // Save to localStorage
        const users = existingUsers;
        users.push(user);
        localStorage.setItem('track_your_job_users', JSON.stringify(users));
        localStorage.setItem(`track_your_job_pwd_${email}`, password);

        // Log user in
        this.setCurrentUser(user);
        return true;
    }

    login(email: string, password: string): boolean {
        const users = this.getAllUsers();
        const user = users.find(u => u.email === email);

        if (!user) {
            alert('Email ou mot de passe incorrect');
            return false;
        }

        const storedPassword = localStorage.getItem(`track_your_job_pwd_${email}`);
        if (storedPassword !== password) {
            alert('Email ou mot de passe incorrect');
            return false;
        }

        this.setCurrentUser(user);
        return true;
    }

    loginWithGoogle(): boolean {
        // Mock Google login - create a user
        const user: User = {
            id: this.generateId(),
            fullName: 'Utilisateur Google',
            email: 'user@gmail.com',
            authMethod: 'google',
            createdAt: new Date()
        };

        this.setCurrentUser(user);
        return true;
    }

    logout() {
        localStorage.removeItem(this.STORAGE_KEY);
        localStorage.removeItem(this.AUTH_TOKEN_KEY);
        this.currentUser.set(null);
        this.isAuthenticated.set(false);
        this.router.navigate(['/']);
    }

    private setCurrentUser(user: User) {
        this.currentUser.set(user);
        this.isAuthenticated.set(true);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
        localStorage.setItem(this.AUTH_TOKEN_KEY, this.generateToken());
    }

    private getAllUsers(): User[] {
        const usersJson = localStorage.getItem('track_your_job_users');
        return usersJson ? JSON.parse(usersJson) : [];
    }

    private generateId(): string {
        return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    private generateToken(): string {
        return 'token_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    updateUserProfile(updates: Partial<User>) {
        const user = this.currentUser();
        if (user) {
            const updatedUser = { ...user, ...updates };
            this.currentUser.set(updatedUser);
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(updatedUser));

            // Update in users list
            const users = this.getAllUsers();
            const index = users.findIndex(u => u.id === user.id);
            if (index !== -1) {
                users[index] = updatedUser;
                localStorage.setItem('track_your_job_users', JSON.stringify(users));
            }
        }
    }

    deleteUser() {
        const user = this.currentUser();
        if (user) {
            // Remove from users list
            const users = this.getAllUsers();
            const newUsers = users.filter(u => u.id !== user.id);
            localStorage.setItem('track_your_job_users', JSON.stringify(newUsers));

            // Remove password if exists
            localStorage.removeItem(`track_your_job_pwd_${user.email}`);

            // Logout
            this.logout();
        }
    }
}
