import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
    Application,
    Company,
    Contact,
    STATUS_LABELS,
    currentStatus,
    enteredStatusAt,
    interviewEvents
} from '../core/models/job-search.models';
import { statusClass } from '../core/models/status-style';
import { JobSearchStore } from '../core/services/job-search-store.service';
import { ContactDraft, ContactFormComponent } from './contact-form/contact-form.component';

interface Affiliation {
    companyId: number;
    name: string;
    current: boolean;
    role?: string;
    applicationCount: number;
}

interface ContactRow {
    id: number;
    fullName: string;
    initials: string;
    role: string;
    /** Rattachement actuel, celui qu'on affiche en premier. */
    companyName: string;
    companyId: number | null;
    email: string;
    phone: string;
    linkedin: string;
    notes: string;
    affiliations: Affiliation[];
    /** « Entretien le 25 sept. chez Agence Why », dérivé des candidatures. */
    activity: string;
    /** Une candidature en attente de relance chez l'une de ses entreprises. */
    toFollowUp: boolean;
    /** Clé de tri : nom de famille d'abord, comme dans un répertoire. */
    sortKey: string;
    letter: string;
}

interface LetterGroup {
    letter: string;
    contacts: ContactRow[];
}

@Component({
    selector: 'app-contacts',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, ContactFormComponent],
    templateUrl: './contacts.component.html',
    styleUrl: './contacts.component.css'
})
export class ContactsComponent {
    private store = inject(JobSearchStore);
    private router = inject(Router);

    searchTerm = signal('');
    companyFilter = signal<number | ''>('');
    onlyToFollowUp = signal(false);

    selectedId = signal<number | null>(null);

    showFormModal = signal(false);
    editing = signal<Contact | null>(null);
    showDeleteConfirm = signal(false);

    statusClass = statusClass;
    readonly statusLabels = STATUS_LABELS;

    companies = computed(() =>
        [...this.store.companies()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    );

    private rows = computed<ContactRow[]>(() => {
        const companies = this.store.companies();
        const applications = this.store.applications();
        return this.store.contacts()
            .map(contact => this.toRow(contact, companies, applications))
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'fr'));
    });

    filtered = computed<ContactRow[]>(() => {
        const term = this.searchTerm().trim().toLowerCase();
        const companyId = this.companyFilter();
        const followUp = this.onlyToFollowUp();

        return this.rows().filter(row => {
            if (followUp && !row.toFollowUp) return false;
            if (companyId !== '' && !row.affiliations.some(a => a.companyId === companyId)) return false;
            if (!term) return true;
            return row.fullName.toLowerCase().includes(term)
                || row.role.toLowerCase().includes(term)
                || row.affiliations.some(a => a.name.toLowerCase().includes(term));
        });
    });

    groups = computed<LetterGroup[]>(() => {
        const groups: LetterGroup[] = [];
        for (const row of this.filtered()) {
            const last = groups[groups.length - 1];
            if (last && last.letter === row.letter) {
                last.contacts.push(row);
            } else {
                groups.push({ letter: row.letter, contacts: [row] });
            }
        }
        return groups;
    });

    selected = computed<ContactRow | null>(() => {
        const id = this.selectedId();
        const rows = this.filtered();
        if (id !== null) {
            const found = rows.find(row => row.id === id);
            if (found) return found;
        }
        return rows.length > 0 ? rows[0] : null;
    });

    total = computed(() => this.rows().length);
    followUpCount = computed(() => this.rows().filter(row => row.toFollowUp).length);
    companyCount = computed(() => this.store.companies().length);

    hasFilters = computed(() =>
        !!this.searchTerm() || this.companyFilter() !== '' || this.onlyToFollowUp()
    );

    // --------------------------------------------------------------- actions

    select(row: ContactRow): void {
        this.selectedId.set(row.id);
    }

    openForm(row?: ContactRow): void {
        this.editing.set(row ? this.store.contact(row.id) ?? null : null);
        this.showFormModal.set(true);
    }

    closeForm(): void {
        this.showFormModal.set(false);
        this.editing.set(null);
    }

    onSave(draft: ContactDraft): void {
        const editing = this.editing();
        const companyId = draft.companyName
            ? this.store.ensureCompany(draft.companyName)
            : null;

        if (editing) {
            this.store.updateContact(editing.id, {
                fullName: draft.fullName,
                role: draft.role,
                email: draft.email,
                phone: draft.phone,
                linkedin: draft.linkedin,
                notes: draft.notes
            });
            if (companyId !== null) {
                this.store.attachContactToCompany(editing.id, companyId, draft.role);
            }
        } else {
            const id = this.store.addContact({
                fullName: draft.fullName,
                role: draft.role,
                email: draft.email,
                phone: draft.phone,
                linkedin: draft.linkedin,
                notes: draft.notes,
                affiliations: []
            });
            if (companyId !== null) {
                this.store.attachContactToCompany(id, companyId, draft.role);
            }
            this.selectedId.set(id);
        }

        this.closeForm();
    }

    askDelete(): void {
        this.showDeleteConfirm.set(true);
    }

    cancelDelete(): void {
        this.showDeleteConfirm.set(false);
    }

    confirmDelete(): void {
        const row = this.selected();
        if (row) {
            this.store.deleteContact(row.id);
            this.selectedId.set(null);
        }
        this.showDeleteConfirm.set(false);
    }

    detach(row: ContactRow, affiliation: Affiliation): void {
        this.store.detachContactFromCompany(row.id, affiliation.companyId);
    }

    openCompany(companyId: number): void {
        this.router.navigate(['/entreprises', companyId]);
    }

    resetFilters(): void {
        this.searchTerm.set('');
        this.companyFilter.set('');
        this.onlyToFollowUp.set(false);
    }

    // ---------------------------------------------------------------- modèle

    private toRow(contact: Contact, companies: Company[], applications: Application[]): ContactRow {
        const affiliations: Affiliation[] = contact.affiliations
            .map(affiliation => {
                const company = companies.find(entry => entry.id === affiliation.companyId);
                return {
                    companyId: affiliation.companyId,
                    name: company?.name ?? 'Entreprise supprimée',
                    current: affiliation.current,
                    role: affiliation.role,
                    applicationCount: applications.filter(app => app.companyId === affiliation.companyId).length
                };
            })
            .sort((a, b) => Number(b.current) - Number(a.current));

        const primary = affiliations.find(a => a.current) ?? affiliations[0];
        const related = applications.filter(app =>
            app.companyId !== null && affiliations.some(a => a.companyId === app.companyId)
        );

        const surname = surnameOf(contact.fullName);

        return {
            id: contact.id,
            fullName: contact.fullName,
            initials: initials(contact.fullName),
            role: contact.role ?? '',
            companyName: primary?.name ?? '',
            companyId: primary?.companyId ?? null,
            email: contact.email ?? '',
            phone: contact.phone ?? '',
            linkedin: contact.linkedin ?? '',
            notes: contact.notes ?? '',
            affiliations,
            activity: activityLabel(related, companies),
            toFollowUp: related.some(app => currentStatus(app) === 'to_relaunch'),
            sortKey: `${surname} ${contact.fullName}`.toLocaleLowerCase('fr'),
            letter: (surname[0] ?? '?').toLocaleUpperCase('fr')
        };
    }
}

// --------------------------------------------------------------------------

/** Particules qui font partie du nom de famille : « Le Goff » se classe en L. */
const PARTICLES = ['le', 'la', 'les', 'de', 'du', 'des', 'van', 'von', 'da', 'di', "d'", "l'"];

/**
 * Nom de famille présumé : le dernier mot, précédé de sa particule le cas
 * échéant. Un répertoire se classe par nom de famille, pas par prénom.
 */
function surnameOf(fullName: string): string {
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    if (words.length <= 1) return words[0] ?? '';

    const last = words[words.length - 1];
    const before = words[words.length - 2];
    if (words.length > 2 && PARTICLES.includes(before.toLocaleLowerCase('fr'))) {
        return `${before} ${last}`;
    }
    return last;
}

function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Dernier fait marquant chez l'une des entreprises du contact. */
function activityLabel(applications: Application[], companies: Company[]): string {
    if (applications.length === 0) return 'Aucune candidature en cours';

    let best: { at: string; text: string } | null = null;

    for (const application of applications) {
        const company = companies.find(entry => entry.id === application.companyId);
        const status = currentStatus(application);
        const next = interviewEvents(application).find(event => new Date(event.at) >= new Date());

        const candidate = next
            ? { at: next.at, text: `Entretien le ${shortDate(next.at)} chez ${company?.name ?? '—'}` }
            : {
                at: enteredStatusAt(application, status) ?? application.createdAt,
                text: `${STATUS_LABELS[status]} chez ${company?.name ?? '—'}`
            };

        if (!best || new Date(candidate.at) > new Date(best.at)) {
            best = candidate;
        }
    }

    return best ? best.text : 'Aucune candidature en cours';
}
