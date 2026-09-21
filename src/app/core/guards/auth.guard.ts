import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Attend la première réponse de Firebase avant de décider. Sans cette
 * attente, un rechargement de page renverrait sur l'accueil le temps que la
 * session soit restaurée.
 */
export const authGuard: CanActivateFn = async () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    await authService.whenReady();

    if (authService.isAuthenticated()) {
        return true;
    }

    await router.navigate(['/']);
    return false;
};
