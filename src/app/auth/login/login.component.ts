import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.css'
})
export class LoginComponent {
    private router = inject(Router);
    private authService = inject(AuthService);

    email = signal('');
    password = signal('');
    error = signal('');
    busy = signal(false);

    /** Réinitialisation par email, envoyée par Firebase. */
    showReset = signal(false);
    resetEmail = signal('');
    resetError = signal('');
    resetSent = signal(false);
    resetBusy = signal(false);

    async withGoogle(): Promise<void> {
        this.error.set('');
        this.busy.set(true);
        const result = await this.authService.loginWithGoogle();
        this.busy.set(false);

        if (result.ok) {
            await this.router.navigate(['/resume']);
        } else {
            this.error.set(result.error ?? 'Connexion impossible.');
        }
    }

    async submit(): Promise<void> {
        this.error.set('');
        this.busy.set(true);
        const result = await this.authService.login(this.email().trim(), this.password());
        this.busy.set(false);

        if (result.ok) {
            await this.router.navigate(['/resume']);
        } else {
            this.error.set(result.error ?? 'Connexion impossible.');
        }
    }

    openReset(): void {
        this.resetEmail.set(this.email().trim());
        this.resetError.set('');
        this.resetSent.set(false);
        this.showReset.set(true);
    }

    closeReset(): void {
        this.showReset.set(false);
    }

    async sendReset(): Promise<void> {
        this.resetError.set('');
        this.resetBusy.set(true);
        const result = await this.authService.sendPasswordReset(this.resetEmail().trim());
        this.resetBusy.set(false);

        if (result.ok) {
            this.resetSent.set(true);
        } else {
            this.resetError.set(result.error ?? 'Envoi impossible.');
        }
    }
}
