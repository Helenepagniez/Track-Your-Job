import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import {
    APPLICATION_STATUSES,
    Application,
    ApplicationStatus,
    INTERVIEW_LABELS,
    InterviewKind,
    NO_COMPANY_LABEL,
    STATUS_LABELS,
    currentStatus,
    sentAt
} from '../../core/models/job-search.models';
import { statusClass, statusDotClass } from '../../core/models/status-style';
import { ApplicationDraft, JobSearchStore } from '../../core/services/job-search-store.service';
import { TasksService } from '../../core/services/tasks.service';
import { Task } from '../../tasks/task.model';
import { OfferFormComponent } from '../offer-form/offer-form.component';

interface TimelineEntry {
    at: string;
    dateLabel: string;
    label: string;
    detail: string;
    dotClass: string;
    kind: 'created' | 'status' | 'interview' | 'note';
}

interface PostingSection {
    label: string;
    content: string;
}

@Component({
    selector: 'app-offer-detail',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, OfferFormComponent],
    templateUrl: './offer-detail.component.html',
    styleUrl: './offer-detail.component.css'
})
export class OfferDetailComponent {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private store = inject(JobSearchStore);
    private tasksService = inject(TasksService);

    private applicationId = signal<number | null>(null);

    readonly allStatuses = APPLICATION_STATUSES;
    readonly statusLabels = STATUS_LABELS;
    readonly interviewKinds: { value: InterviewKind, label: string }[] = [
        { value: 'prequal', label: 'Préqualification' },
        { value: 'phone', label: 'Téléphone' },
        { value: 'video', label: 'Visio' },
        { value: 'onsite', label: 'Sur place' }
    ];

    statusClass = statusClass;
    statusDotClass = statusDotClass;

    statusMenuOpen = signal(false);
    showEditModal = signal(false);
    showDeleteConfirm = signal(false);
    showInterviewForm = signal(false);
    interviewDraft = signal({ at: '', kind: 'video' as InterviewKind });

    constructor() {
        this.route.paramMap.subscribe(params => {
            const raw = Number(params.get('id'));
            this.applicationId.set(isNaN(raw) ? null : raw);
        });
    }

    application = computed<Application | undefined>(() => {
        const id = this.applicationId();
        return id === null ? undefined : this.store.application(id);
    });

    company = computed(() => this.store.company(this.application()?.companyId));

    companyLabel = computed<string>(() => {
        const application = this.application();
        if (!application) return '';
        const company = this.company();
        if (company) return company.name;
        return application.agencyName
            ? `${application.agencyName} · client non cité`
            : NO_COMPANY_LABEL;
    });

    status = computed<ApplicationStatus>(() => {
        const application = this.application();
        return application ? currentStatus(application) : 'to_apply';
    });

    meta = computed<string[]>(() => {
        const application = this.application();
        if (!application) return [];
        const parts: string[] = [];
        if (application.contractType) {
            parts.push(application.contractDuration
                ? `${application.contractType} · ${application.contractDuration}`
                : application.contractType);
        }
        if (application.weeklyHours) parts.push(application.weeklyHours);
        if (application.location) parts.push(application.location);
        if (application.salary) parts.push(application.salary);
        if (application.source) parts.push(`via ${application.source}`);
        return parts;
    });

    /** Toute l'histoire de la candidature, du plus récent au plus ancien. */
    timeline = computed<TimelineEntry[]>(() => {
        const application = this.application();
        if (!application) return [];

        return application.events
            .map(event => {
                if (event.type === 'status' && event.status) {
                    return {
                        at: event.at,
                        dateLabel: longDate(event.at),
                        label: STATUS_LABELS[event.status],
                        detail: event.details ?? '',
                        dotClass: statusDotClass(event.status),
                        kind: 'status' as const
                    };
                }
                if (event.type === 'interview') {
                    const kind = event.interviewKind ?? 'video';
                    return {
                        at: event.at,
                        dateLabel: longDate(event.at),
                        label: INTERVIEW_LABELS[kind],
                        detail: new Date(event.at) > new Date() ? 'à venir' : 'passé',
                        dotClass: statusDotClass('interview'),
                        kind: 'interview' as const
                    };
                }
                return {
                    at: event.at,
                    dateLabel: longDate(event.at),
                    label: event.type === 'created' ? 'Candidature créée' : 'Note',
                    detail: event.details ?? '',
                    dotClass: 'dot-to_apply',
                    kind: event.type === 'created' ? 'created' as const : 'note' as const
                };
            })
            .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    });

    posting = computed<PostingSection[]>(() => {
        const posting = this.application()?.posting;
        if (!posting) return [];
        return [
            { label: 'Missions', content: posting.missions ?? '' },
            { label: 'Profil recherché', content: posting.profile ?? '' },
            { label: 'Avantages', content: posting.benefits ?? '' },
            { label: 'Étapes de recrutement', content: posting.recruitmentProcess ?? '' },
            { label: 'Présentation du poste', content: posting.description ?? '' },
            { label: 'Autres informations', content: posting.others ?? '' }
        ].filter(section => section.content.trim().length > 0);
    });

    contacts = computed(() => {
        const company = this.company();
        return company ? this.store.contactsOfCompany(company.id) : [];
    });

    tasks = computed<Task[]>(() => {
        const id = this.applicationId();
        if (id === null) return [];
        return this.tasksService.tasks()
            .filter(task => (task.applicationIds ?? []).includes(id))
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    });

    sentLabel = computed<string>(() => {
        const application = this.application();
        if (!application) return '';
        const at = sentAt(application);
        return at ? `Envoyée le ${longDate(at)}` : 'Pas encore envoyée';
    });

    // --------------------------------------------------------------- actions

    back(): void {
        this.router.navigate(['/offres']);
    }

    toggleStatusMenu(): void {
        this.statusMenuOpen.update(open => !open);
    }

    pickStatus(status: ApplicationStatus): void {
        this.statusMenuOpen.set(false);
        const application = this.application();
        if (!application || this.status() === status) return;
        this.store.setStatus(application.id, status);
        if (status === 'interview') {
            this.openInterviewForm();
        }
    }

    openInterviewForm(): void {
        this.interviewDraft.set({ at: '', kind: 'video' });
        this.showInterviewForm.set(true);
    }

    closeInterviewForm(): void {
        this.showInterviewForm.set(false);
    }

    updateInterviewDraft(patch: Partial<{ at: string; kind: InterviewKind }>): void {
        this.interviewDraft.update(current => ({ ...current, ...patch }));
    }

    addInterview(): void {
        const application = this.application();
        const draft = this.interviewDraft();
        if (!application || !draft.at) return;
        this.store.recordInterview(application.id, draft.kind, new Date(draft.at));
        this.closeInterviewForm();
    }

    openEdit(): void {
        this.showEditModal.set(true);
    }

    closeEdit(): void {
        this.showEditModal.set(false);
    }

    onSave(draft: ApplicationDraft): void {
        const application = this.application();
        if (!application) return;
        this.store.applyDraft(application.id, draft);
        this.closeEdit();
    }

    askDelete(): void {
        this.showDeleteConfirm.set(true);
    }

    cancelDelete(): void {
        this.showDeleteConfirm.set(false);
    }

    confirmDelete(): void {
        const application = this.application();
        if (application) {
            this.store.deleteApplication(application.id);
        }
        this.router.navigate(['/offres']);
    }

    toggleTask(task: Task): void {
        this.tasksService.toggleTask(task.id);
    }

    openCompany(): void {
        const company = this.company();
        if (company) {
            this.router.navigate(['/entreprises', company.id]);
        }
    }
}

// --------------------------------------------------------------------------

function longDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}
