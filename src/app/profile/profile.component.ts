import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/services/auth.service';
import { ProfileFormComponent } from './profile-form/profile-form.component';

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, ProfileFormComponent],
    templateUrl: './profile.component.html',
    styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit {
    user = {
        firstName: '',
        lastName: '',
        email: '',
        title: 'Développeur Full Stack',
        location: 'Paris, France',
        bio: 'Passionné par Angular et le développement web moderne.'
    };

    isEditing = false;
    isDeleting = false;

    constructor(private authService: AuthService) { }

    ngOnInit() {
        const currentUser = this.authService.currentUser();
        if (currentUser) {
            const nameParts = currentUser.fullName.split(' ');
            this.user.firstName = nameParts[0] || '';
            this.user.lastName = nameParts.slice(1).join(' ') || '';
            this.user.email = currentUser.email;

            if (currentUser.title) this.user.title = currentUser.title;
            if (currentUser.location) this.user.location = currentUser.location;
            if (currentUser.bio) this.user.bio = currentUser.bio;
        }
    }

    toggleEdit() {
        this.isEditing = !this.isEditing;
    }

    closeEditModal() {
        this.isEditing = false;
    }

    onUpdateUser(updatedData: any) {
        this.isEditing = false;

        // Update local user object
        this.user = { ...this.user, ...updatedData };

        const fullName = `${updatedData.firstName} ${updatedData.lastName}`.trim();

        this.authService.updateUserProfile({
            fullName,
            title: updatedData.title,
            location: updatedData.location,
            bio: updatedData.bio
        });
    }

    toggleDelete() {
        this.isDeleting = !this.isDeleting;
    }

    cancelDelete() {
        this.isDeleting = false;
    }

    confirmDelete() {
        this.authService.deleteUser();
        this.isDeleting = false;
    }
}
