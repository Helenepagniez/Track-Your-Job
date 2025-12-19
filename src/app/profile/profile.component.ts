import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/services/auth.service';
import { ProfileFormComponent } from './profile-form/profile-form.component';
import { LocalStorageService } from '../core/services/local-storage.service';

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
        title: '',
        location: ''
    };

    isEditing = false;
    isDeleting = false;

    constructor(
        private authService: AuthService,
        private localStorageService: LocalStorageService
    ) { }

    ngOnInit() {
        const currentUser = this.authService.currentUser();
        if (currentUser) {
            const nameParts = currentUser.fullName.split(' ');
            this.user.firstName = nameParts[0] || '';
            this.user.lastName = nameParts.slice(1).join(' ') || '';
            this.user.email = currentUser.email;

            if (currentUser.title) this.user.title = currentUser.title;
            if (currentUser.location) this.user.location = currentUser.location;
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
            location: updatedData.location
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

    exportData() {
        const data = this.localStorageService.exportData();
        const blob = new Blob([data], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const date = new Date().toISOString().split('T')[0];
        a.download = `track-your-job-data-${date}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                const content = e.target.result;
                if (this.localStorageService.importData(content)) {
                    alert('Données importées avec succès ! La page va se recharger.');
                    window.location.reload();
                } else {
                    alert('Erreur lors de l\'importation des données. Vérifiez le format du fichier.');
                }
            };
            reader.readAsText(file);
        }
    }
}
