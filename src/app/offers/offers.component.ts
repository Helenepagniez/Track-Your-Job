import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import {
    APPLICATION_STATUSES,
    Application,
    ApplicationStatus,
    Company,
    NO_COMPANY_LABEL,
    STATUS_LABELS,
    currentStatus,
    enteredStatusAt,
    interviewEvents,
    sentAt
} from '../core/models/job-search.models';
import { statusClass, statusDotClass } from '../core/models/status-style';
import { ApplicationDraft, JobSearchStore } from '../core/services/job-search-store.service';
import { OfferFormComponent } from './offer-form/offer-form.component';

/** Une carte du tableau, tout ce qu'il faut afficher et rien de plus. */
interface Card {
    id: number;
    title: string;
    companyId: number | null;
    companyName: string;
    initials: string;
    location: string;
    salary?: string;
    source?: string;
    status: ApplicationStatus;
    statusLabel: string;
    statusClass: string;
    /** « Sans réponse depuis 17 j », « Entretien le 25 sept. »… */
    meta: string;
    /** Relance en retard : la carte se signale. */
    urgent: boolean;
    /** Statut « entretien » sans date connue : on la demande sur la carte. */
    needsInterviewDate: boolean;
    contactInitials: string;
}

interface Column {
    key: string;
    label: string;
    /** Le premier statut est celui appliqué par un glisser-déposer. */
    statuses: ApplicationStatus[];
    dotClass: string;
    cards: Card[];
}

const COLUMNS: { key: string; label: string; statuses: ApplicationStatus[] }[] = [
    { key: 'to_apply', label: 'À postuler', statuses: ['to_apply'] },
    { key: 'sent', label: 'Envoyée', statuses: ['sent'] },
    { key: 'to_relaunch', label: 'À relancer', statuses: ['to_relaunch', 'no_response'] },
    { key: 'interview', label: 'Entretien', statuses: ['interview'] },
    { key: 'offer', label: 'Offre reçue', statuses: ['offer'] },
    { key: 'rejected', label: 'Refusée', statuses: ['rejected', 'withdrawn'] }
];

@Component({
    selector: 'app-offers',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, DragDropModule, OfferFormComponent],
    templateUrl: './offers.component.html',
    styleUrl: './offers.component.css'
})
export class OffersComponent {
    private store = inject(JobSearchStore);
    private router = inject(Router);

    view = signal<'board' | 'list'>('board');
    searchTerm = signal('');
    statusFilter = signal<ApplicationStatus | ''>('');
    companyFilter = signal<number | ''>('');
    onlyDue = signal(false);

    /** Carte dont le menu de statut est ouvert. */
    openStatusMenu = signal<number | null>(null);
    /** Carte dont on est en train de saisir la date d'entretien. */
    interviewDraft = signal<{ id: number; date: string } | null>(null);

    showFormModal = signal(false);
    editing = signal<Application | null>(null);
    showDeleteConfirm = signal(false);
    toDelete = signal<number | null>(null);

    readonly allStatuses = APPLICATION_STATUSES;
    readonly statusLabels = STATUS_LABELS;
    readonly columnDefs = COLUMNS;

    statusClass = statusClass;
    statusDotClass = statusDotClass;

    campaignName = computed(() => this.store.activeCampaign()?.name ?? 'Ma recherche');

    companies = computed(() =>
        [...this.store.companies()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    );

    private cards = computed<Card[]>(() => {
        const companies = this.store.companies();
        return this.store.currentApplications()
            .map(application => this.toCard(application, companies))
            .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
    });

    filteredCards = computed<Card[]>(() => {
        const term = this.searchTerm().trim().toLowerCase();
        const status = this.statusFilter();
        const companyId = this.companyFilter();
        const due = this.onlyDue();

        return this.cards().filter(card => {
            if (status && card.status !== status) return false;
            if (companyId !== '' && card.companyId !== companyId) return false;
            if (due && !card.urgent) return false;
            if (!term) return true;
            return card.title.toLowerCase().includes(term)
                || card.companyName.toLowerCase().includes(term)
                || card.location.toLowerCase().includes(term);
        });
    });

    columns = computed<Column[]>(() => {
        const cards = this.filteredCards();
        return COLUMNS.map(definition => ({
            key: definition.key,
            label: definition.label,
            statuses: definition.statuses,
            dotClass: statusDotClass(definition.statuses[0]),
            cards: cards.filter(card => definition.statuses.includes(card.status))
        }));
    });

    dueCount = computed(() => this.cards().filter(card => card.urgent).length);
    total = computed(() => this.cards().length);

    // ------------------------------------------------------------ le geste

    /**
     * Changer un statut : un clic sur la pastille, un clic sur le nouveau
     * statut. Pas de page à quitter, pas de formulaire à rouvrir.
     */
    pickStatus(card: Card, status: ApplicationStatus): void {
        this.openStatusMenu.set(null);
        if (card.status === status) return;
        this.store.setStatus(card.id, status);
        if (status === 'interview') {
            this.startInterviewDraft(card.id);
        }
    }

    toggleStatusMenu(card: Card): void {
        this.openStatusMenu.update(open => (open === card.id ? null : card.id));
    }

    closeMenus(): void {
        this.openStatusMenu.set(null);
    }

    /** Glisser une carte d'une colonne à l'autre applique son statut. */
    onCardDropped(event: CdkDragDrop<Column>, target: Column): void {
        const card = event.item.data as Card;
        const status = target.statuses[0];
        if (card.status === status) return;
        this.store.setStatus(card.id, status);
        if (status === 'interview') {
            this.startInterviewDraft(card.id);
        }
    }

    // ------------------------------------------------- date d'un entretien

    startInterviewDraft(id: number): void {
        this.interviewDraft.set({ id, date: '' });
    }

    updateInterviewDraft(date: string): void {
        const draft = this.interviewDraft();
        if (draft) this.interviewDraft.set({ ...draft, date });
    }

    confirmInterviewDate(): void {
        const draft = this.interviewDraft();
        if (!draft || !draft.date) return;
        this.store.recordInterview(draft.id, 'video', new Date(draft.date));
        this.interviewDraft.set(null);
    }

    cancelInterviewDate(): void {
        this.interviewDraft.set(null);
    }

    isDraftingInterview(card: Card): boolean {
        return this.interviewDraft()?.id === card.id;
    }

    draftDate(): string {
        return this.interviewDraft()?.date ?? '';
    }

    // ----------------------------------------------------------- formulaire

    openForm(card?: Card): void {
        this.editing.set(card ? this.store.application(card.id) ?? null : null);
        this.showFormModal.set(true);
    }

    closeForm(): void {
        this.showFormModal.set(false);
        this.editing.set(null);
    }

    onSaveOffer(draft: ApplicationDraft): void {
        this.store.applyDraft(this.editing()?.id ?? null, draft);
        this.closeForm();
    }

    // -------------------------------------------------------- suppression

    askDelete(card: Card): void {
        this.toDelete.set(card.id);
        this.showDeleteConfirm.set(true);
    }

    cancelDelete(): void {
        this.showDeleteConfirm.set(false);
        this.toDelete.set(null);
    }

    confirmDelete(): void {
        const id = this.toDelete();
        if (id !== null) {
            this.store.deleteApplication(id);
        }
        this.cancelDelete();
    }

    // ------------------------------------------------------------ navigation

    openDetail(card: Card): void {
        this.router.navigate(['/offres', card.id]);
    }

    openCompany(card: Card, event: MouseEvent): void {
        event.stopPropagation();
        if (card.companyId !== null) {
            this.router.navigate(['/entreprises', card.companyId]);
        }
    }

    resetFilters(): void {
        this.searchTerm.set('');
        this.statusFilter.set('');
        this.companyFilter.set('');
        this.onlyDue.set(false);
    }

    hasFilters = computed(() =>
        !!this.searchTerm() || !!this.statusFilter() || this.companyFilter() !== '' || this.onlyDue()
    );

    // --------------------------------------------------------------- modèle

    private toCard(application: Application, companies: Company[]): Card {
        const company = application.companyId !== null
            ? companies.find(entry => entry.id === application.companyId)
            : undefined;
        const status = currentStatus(application);
        const interviews = interviewEvents(application);
        const upcoming = interviews.filter(event => new Date(event.at) >= new Date());
        const contact = application.contactIds
            .map(id => this.store.contact(id))
            .find(entry => !!entry);

        const companyName = company?.name
            ?? (application.agencyName ? `${application.agencyName} · client non cité` : NO_COMPANY_LABEL);

        return {
            id: application.id,
            title: application.title,
            companyId: application.companyId,
            companyName,
            initials: initialsOf(company?.name ?? application.agencyName ?? '—'),
            location: application.location ?? '',
            salary: application.salary,
            source: application.source,
            status,
            statusLabel: STATUS_LABELS[status],
            statusClass: statusClass(status),
            meta: metaFor(application, status, interviews),
            urgent: isUrgent(application, status),
            needsInterviewDate: status === 'interview' && upcoming.length === 0,
            contactInitials: contact ? initialsOf(contact.fullName) : ''
        };
    }
}

// --------------------------------------------------------------------------

function initialsOf(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '—';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function daysSince(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function metaFor(
    application: Application,
    status: ApplicationStatus,
    interviews: { at: string }[]
): string {
    switch (status) {
        case 'to_apply': {
            const days = daysSince(application.createdAt);
            return days <= 0 ? "Repérée aujourd'hui" : `Repérée il y a ${days} j`;
        }
        case 'sent': {
            const at = sentAt(application) ?? application.createdAt;
            const days = daysSince(at);
            return days <= 0 ? "Envoyée aujourd'hui" : `Envoyée il y a ${days} j`;
        }
        case 'to_relaunch': {
            const at = sentAt(application) ?? application.createdAt;
            return `Sans réponse depuis ${daysSince(at)} j`;
        }
        case 'no_response': {
            const at = enteredStatusAt(application, 'no_response');
            return at ? `Classée sans réponse le ${shortDate(at)}` : 'Sans réponse';
        }
        case 'interview': {
            const next = interviews.find(event => new Date(event.at) >= new Date());
            if (next) return `Entretien le ${shortDate(next.at)}`;
            const last = interviews[interviews.length - 1];
            return last ? `Entretien passé le ${shortDate(last.at)}` : 'Date à préciser';
        }
        case 'offer': {
            const at = enteredStatusAt(application, 'offer');
            return at ? `Offre reçue le ${shortDate(at)}` : 'Offre reçue';
        }
        case 'rejected': {
            const at = enteredStatusAt(application, 'rejected');
            return at ? `Refus le ${shortDate(at)}` : 'Refusée';
        }
        default:
            return 'Abandonnée';
    }
}

/** Ce qui réclame une action : relance en attente depuis plus de trois jours. */
function isUrgent(application: Application, status: ApplicationStatus): boolean {
    if (status !== 'to_relaunch') return false;
    const at = enteredStatusAt(application, 'to_relaunch');
    return !at || daysSince(at) >= 3;
}
