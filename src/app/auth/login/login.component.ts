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

    /** Réinitialisation locale du mot de passe. */
    showReset = signal(false);
    resetEmail = signal('');
    resetPassword = signal('');
    resetError = signal('');
    resetDone = signal(false);

    submit(): void {
        this.error.set('');
        const result = this.authService.login(this.email().trim(), this.password());

        if (result.ok) {
            this.router.navigate(['/resume']);
        } else {
            this.error.set(result.error ?? 'Connexion impossible.');
        }
    }

    openReset(): void {
        this.resetEmail.set(this.email().trim());
        this.resetPassword.set('');
        this.resetError.set('');
        this.resetDone.set(false);
        this.showReset.set(true);
    }

    closeReset(): void {
        this.showReset.set(false);
    }

    submitReset(): void {
        this.resetError.set('');
        const result = this.authService.resetPasswordLocally(
            this.resetEmail().trim(),
            this.resetPassword()
        );

        if (result.ok) {
            this.resetDone.set(true);
            this.email.set(this.resetEmail().trim());
            this.password.set('');
        } else {
            this.resetError.set(result.error ?? 'Réinitialisation impossible.');
        }
    }
}
