import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    Profile,
    ProfileChecklistItem,
    ProfileDocument,
    profileChecklist,
    profileCompletion
} from '../core/models/job-search.models';
import { AuthService } from '../core/services/auth.service';
import { BackupService } from '../core/services/backup.service';
import { JobSearchStore } from '../core/services/job-search-store.service';
import { UserDataService } from '../core/services/user-data.service';
import { CampaignPanelComponent } from '../campaigns/campaign-panel/campaign-panel.component';
import { ProfileDraft, ProfileFormComponent } from './profile-form/profile-form.component';

interface Criterion {
    label: string;
    value: string;
    filled: boolean;
}

const DOCUMENT_KINDS: { value: ProfileDocument['kind'], label: string }[] = [
    { value: 'cv', label: 'CV' },
    { value: 'cover_letter', label: 'Lettre de motivation' },
    { value: 'portfolio', label: 'Portfolio' },
    { value: 'other', label: 'Autre' }
];

@Component({
    selector: 'app-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, ProfileFormComponent, CampaignPanelComponent],
    templateUrl: './profile.component.html',
    styleUrl: './profile.component.css'
})
export class ProfileComponent {
    private store = inject(JobSearchStore);
    private authService = inject(AuthService);
    private userData = inject(UserDataService);
    private backup = inject(BackupService);

    readonly documentKinds = DOCUMENT_KINDS;

    isEditing = signal(false);
    isDeleting = signal(false);
    showDocumentForm = signal(false);
    documentDraft = signal({ label: '', fileName: '', kind: 'cv' as ProfileDocument['kind'] });
    importError = signal('');
    importDone = signal('');

    /** Reste-t-il des données de l'ancienne version dans ce navigateur ? */
    hasLocalData = signal(this.backup.hasLocalData());

    /** Un compte Google n'a pas de mot de passe à réinitialiser. */
    hasPassword = computed(() => this.authService.currentUser()?.provider === 'password');
    resetSent = signal(false);
    resetError = signal('');

    profile = computed<Profile | null>(() => this.store.profile());

    initials = computed(() => {
        const name = this.profile()?.fullName ?? '';
        const words = name.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) return '?';
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return (words[0][0] + words[words.length - 1][0]).toUpperCase();
    });

    headline = computed<string>(() => {
        const profile = this.profile();
        if (!profile) return '';
        const parts = [profile.title, profile.location, profile.availability]
            .filter((part): part is string => !!part);
        return parts.length > 0 ? parts.join(' · ') : 'Profil à compléter';
    });

    checklist = computed<ProfileChecklistItem[]>(() => profileChecklist(this.profile()));
    completion = computed(() => profileCompletion(this.checklist()));
    missing = computed(() => this.checklist().filter(item => !item.done));
    done = computed(() => this.checklist().filter(item => item.done));

    criteria = computed<Criterion[]>(() => {
        const profile = this.profile();
        const joined = (values?: string[]) => (values ?? []).join(' · ');
        return [
            { label: 'Métiers visés', value: joined(profile?.targetRoles), filled: (profile?.targetRoles?.length ?? 0) > 0 },
            { label: 'Zone', value: profile?.searchZone ?? '', filled: !!profile?.searchZone },
            { label: 'Contrats', value: joined(profile?.contractTypes), filled: (profile?.contractTypes?.length ?? 0) > 0 },
            { label: 'Compétences clés', value: joined(profile?.skills), filled: (profile?.skills?.length ?? 0) > 0 },
            { label: 'Prétentions', value: profile?.salaryExpectation ?? '', filled: !!profile?.salaryExpectation },
            { label: 'Disponibilité', value: profile?.availability ?? '', filled: !!profile?.availability }
        ];
    });

    documents = computed<ProfileDocument[]>(() => this.profile()?.documents ?? []);

    weeklyGoal = computed<number | null>(() => this.store.activeCampaign()?.weeklyGoal ?? null);
    hasCampaign = computed(() => !!this.store.activeCampaign());

    /** Rythme réel de la semaine en cours, pour situer l'objectif. */
    sentThisWeek = computed(() => {
        const start = startOfWeek();
        return this.store.currentApplications().filter(application => {
            const sent = application.events.find(event =>
                event.type === 'status' && event.status === 'sent'
            );
            return !!sent && new Date(sent.at) >= start;
        }).length;
    });

    // ------------------------------------------------------------- édition

    openEdit(): void {
        this.isEditing.set(true);
    }

    closeEdit(): void {
        this.isEditing.set(false);
    }

    onSaveProfile(draft: ProfileDraft): void {
        const patch: Partial<Profile> = {
            fullName: draft.fullName,
            email: draft.email,
            title: draft.title,
            location: draft.location,
            phone: draft.phone,
            availability: draft.availability,
            searchZone: draft.searchZone,
            targetRoles: draft.targetRoles,
            contractTypes: draft.contractTypes,
            skills: draft.skills,
            salaryExpectation: draft.salaryExpectation,
            linkedin: draft.linkedin,
            portfolio: draft.portfolio
        };
        this.store.updateProfile(patch);
        this.closeEdit();
    }

    setWeeklyGoal(value: string): void {
        const parsed = Number(value);
        this.store.setWeeklyGoal(isNaN(parsed) || parsed <= 0 ? undefined : Math.round(parsed));
    }

    // ------------------------------------------------------------ documents

    openDocumentForm(): void {
        this.documentDraft.set({ label: '', fileName: '', kind: 'cv' });
        this.showDocumentForm.set(true);
    }

    closeDocumentForm(): void {
        this.showDocumentForm.set(false);
    }

    updateDraft(patch: Partial<{ label: string; fileName: string; kind: ProfileDocument['kind'] }>): void {
        this.documentDraft.update(current => ({ ...current, ...patch }));
    }

    addDocument(): void {
        const draft = this.documentDraft();
        const label = draft.label.trim();
        if (!label) return;

        const documents = this.documents();
        const nextId = documents.reduce((max, entry) => Math.max(max, entry.id), 0) + 1;

        this.store.updateProfile({
            documents: [...documents, {
                id: nextId,
                label,
                fileName: draft.fileName.trim(),
                kind: draft.kind,
                addedAt: new Date().toISOString()
            }]
        });
        this.closeDocumentForm();
    }

    removeDocument(document: ProfileDocument): void {
        this.store.updateProfile({
            documents: this.documents().filter(entry => entry.id !== document.id)
        });
    }

    kindLabel(kind: ProfileDocument['kind']): string {
        return DOCUMENT_KINDS.find(entry => entry.value === kind)?.label ?? 'Autre';
    }

    // ---------------------------------------------------------- mes données

    exportData(): void {
        this.backup.download(this.userData.exportJson());
    }

    onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        this.importError.set('');
        this.importDone.set('');

        const reader = new FileReader();
        reader.onload = () => {
            const restored = this.backup.parseBackup(String(reader.result ?? ''));
            if (!restored) {
                this.importError.set('Ce fichier ne ressemble pas à une sauvegarde lisible.');
                return;
            }
            this.userData.replaceAll(restored);
            this.importDone.set('Sauvegarde restaurée : elle remplace le contenu du compte.');
        };
        reader.readAsText(file);
        input.value = '';
    }

    /** Reprend ce qui restait dans ce navigateur, sans en laisser de copie. */
    importLocalData(): void {
        const local = this.backup.readLocalData();
        if (!local) {
            this.hasLocalData.set(false);
            return;
        }
        this.userData.replaceAll(local);
        this.backup.clearLocalData();
        this.hasLocalData.set(false);
        this.importDone.set('Données de ce navigateur reprises dans votre compte.');
    }

    dismissLocalData(): void {
        this.backup.clearLocalData();
        this.hasLocalData.set(false);
    }

    // ------------------------------------------------------- mot de passe

    /**
     * Firebase envoie le lien de changement : l'application ne voit jamais le
     * mot de passe, et n'en garde aucune copie.
     */
    async sendPasswordReset(): Promise<void> {
        this.resetError.set('');
        const email = this.profile()?.email;
        if (!email) return;

        const result = await this.authService.sendPasswordReset(email);
        if (result.ok) {
            this.resetSent.set(true);
        } else {
            this.resetError.set(result.error ?? 'Envoi impossible.');
        }
    }

    // -------------------------------------------------------- suppression

    askDelete(): void {
        this.isDeleting.set(true);
    }

    cancelDelete(): void {
        this.isDeleting.set(false);
    }

    async confirmDelete(): Promise<void> {
        // On vide le document avant de supprimer le compte : sans compte, les
        // règles Firestore n'autorisent plus d'écrire.
        await this.userData.clear();
        const result = await this.authService.deleteAccount();
        this.isDeleting.set(false);
        if (!result.ok) {
            this.importError.set(result.error ?? 'Suppression impossible.');
        }
    }
}

// --------------------------------------------------------------------------

/** Lundi de la semaine en cours, à minuit. */
function startOfWeek(): Date {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
}
