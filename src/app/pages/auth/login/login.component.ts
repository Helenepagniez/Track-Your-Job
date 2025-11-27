import { Component } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-login',
    standalone: true,
    imports: [CommonModule, RouterLink, FormsModule],
    templateUrl: './login.component.html',
    styleUrl: './login.component.css'
})
export class LoginComponent {
    email = '';
    password = '';

    constructor(
        private router: Router,
        private authService: AuthService
    ) { }

    onSubmit() {
        if (this.authService.login(this.email, this.password)) {
            this.router.navigate(['/dashboard']);
        }
    }

    loginWithGoogle() {
        if (this.authService.loginWithGoogle()) {
            this.router.navigate(['/dashboard']);
        }
    }
}
