import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
    Application,
    STATUS_LABELS,
    computeCampaignStats,
    currentStatus,
    enteredStatusAt,
    interviewEvents,
    profileChecklist,
    profileCompletion,
    sentAt
} from '../core/models/job-search.models';
import { statusClass } from '../core/models/status-style';
import { JobSearchStore } from '../core/services/job-search-store.service';
import { TasksService } from '../core/services/tasks.service';

interface ActionRow {
    icon: string;
    tone: 'urgent' | 'soon' | 'calm';
    title: string;
    detail: string;
    actionLabel: string;
    route: string[];
}

interface Kpi {
    label: string;
    value: string;
    note: string;
    accent: boolean;
    progress: number;
}

interface FunnelStep {
    label: string;
    width: number;
    className: string;
}

interface Meeting {
    day: string;
    month: string;
    title: string;
    detail: string;
    applicationId: number;
}

interface NetworkRow {
    companyId: number;
    name: string;
    contactName: string;
}

/** Une offre repérée depuis plus longtemps que ça dort. */
const STALE_AFTER_DAYS = 5;

/**
 * Tableau de bord orienté action : ce qui attend une décision aujourd'hui, puis
 * les quatre chiffres qui situent la campagne. Les mesures détaillées sont sur
 * la page Statistiques.
 */
@Component({
    selector: 'app-summary',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './summary.component.html',
    styleUrl: './summary.component.css'
})
export class SummaryComponent {
    private store = inject(JobSearchStore);
    private tasksService = inject(TasksService);

    statusClass = statusClass;
    readonly statusLabels = STATUS_LABELS;

    firstName = computed(() => {
        const name = this.store.profile()?.fullName ?? '';
        return name.trim().split(/\s+/)[0] ?? '';
    });

    campaign = computed(() => this.store.activeCampaign());
    private applications = computed<Application[]>(() => this.store.currentApplications());
    hasApplications = computed(() => this.applications().length > 0);

    private stats = computed(() => {
        const campaign = this.campaign();
        if (!campaign) return null;
        return computeCampaignStats(this.applications(), campaign.startedAt, new Date().toISOString());
    });

    // --------------------------------------------------------- à faire

    actions = computed<ActionRow[]>(() => {
        const rows: ActionRow[] = [];
        const applications = this.applications();

        // 1. Les relances : ce qui se périme si on ne fait rien.
        const toRelaunch = applications
            .filter(application => currentStatus(application) === 'to_relaunch')
            .sort((a, b) => daysSince(sentAt(b) ?? b.createdAt) - daysSince(sentAt(a) ?? a.createdAt));

        for (const application of toRelaunch.slice(0, 3)) {
            const company = this.store.company(application.companyId);
            const silentFor = daysSince(sentAt(application) ?? application.createdAt);
            rows.push({
                icon: 'fa-bell',
                tone: 'urgent',
                title: `Relancer ${company?.name ?? 'cette entreprise'} — ${application.title}`,
                detail: `Sans réponse depuis ${silentFor} jours`,
                actionLabel: 'Ouvrir',
                route: ['/offres', String(application.id)]
            });
        }

        // 2. Les entretiens de la semaine.
        for (const meeting of this.upcomingInterviews().slice(0, 2)) {
            rows.push({
                icon: 'fa-video',
                tone: 'soon',
                title: `Préparer : ${meeting.title}`,
                detail: meeting.detail,
                actionLabel: 'Ouvrir',
                route: ['/offres', String(meeting.applicationId)]
            });
        }

        // 3. Les offres repérées qui dorment.
        const stale = applications.filter(application =>
            currentStatus(application) === 'to_apply'
            && daysSince(application.createdAt) >= STALE_AFTER_DAYS
        );
        if (stale.length > 0) {
            const oldest = Math.max(...stale.map(application => daysSince(application.createdAt)));
            rows.push({
                icon: 'fa-list-check',
                tone: 'calm',
                title: `${stale.length} offre${stale.length > 1 ? 's' : ''} en attente de candidature`,
                detail: `La plus ancienne dort depuis ${oldest} jours`,
                actionLabel: 'Voir le suivi',
                route: ['/offres']
            });
        }

        // 4. Les tâches en retard.
        const overdue = this.tasksService.tasks().filter(task =>
            !task.completed && new Date(task.dueDate).getTime() < Date.now()
        );
        if (overdue.length > 0) {
            rows.push({
                icon: 'fa-clock',
                tone: 'urgent',
                title: `${overdue.length} tâche${overdue.length > 1 ? 's' : ''} en retard`,
                detail: overdue.map(task => task.title).slice(0, 2).join(' · '),
                actionLabel: 'Voir les tâches',
                route: ['/taches']
            });
        }

        // 5. Le profil, s'il bride les suggestions.
        const completion = profileCompletion(profileChecklist(this.store.profile()));
        if (completion < 60) {
            rows.push({
                icon: 'fa-user-pen',
                tone: 'calm',
                title: 'Compléter votre profil',
                detail: `${completion} % renseigné — en dessous de 60 %, les suggestions restent approximatives`,
                actionLabel: 'Compléter',
                route: ['/profil']
            });
        }

        return rows;
    });

    actionSentence = computed<string>(() => {
        const count = this.actions().length;
        if (count === 0) return "Rien d'urgent aujourd'hui. C'est le bon moment pour repérer de nouvelles offres.";
        return `${count} action${count > 1 ? 's' : ''} vous attend${count > 1 ? 'ent' : ''} aujourd'hui.`;
    });

    // ------------------------------------------------------------ chiffres

    kpis = computed<Kpi[]>(() => {
        const stats = this.stats();
        if (!stats) return [];

        const weekStart = startOfWeek();
        const sentThisWeek = this.applications().filter(application => {
            const at = sentAt(application);
            return !!at && new Date(at) >= weekStart;
        }).length;

        const goal = this.campaign()?.weeklyGoal;
        const responseRate = stats.sent > 0 ? Math.round((stats.answered / stats.sent) * 100) : 0;
        const upcoming = this.upcomingInterviews().length;
        const dueRelaunch = this.applications().filter(a => currentStatus(a) === 'to_relaunch');
        const lateRelaunch = dueRelaunch.filter(application => {
            const at = enteredStatusAt(application, 'to_relaunch');
            return !at || daysSince(at) >= 3;
        }).length;

        return [
            {
                label: 'Candidatures envoyées',
                value: String(stats.sent),
                note: goal
                    ? `${sentThisWeek} cette semaine sur ${goal}`
                    : `${sentThisWeek} cette semaine`,
                accent: false,
                progress: goal ? Math.min(100, Math.round((sentThisWeek / goal) * 100)) : 0
            },
            {
                label: 'Taux de réponse',
                value: `${responseRate} %`,
                note: `${stats.answered} réponse${stats.answered > 1 ? 's' : ''} obtenue${stats.answered > 1 ? 's' : ''}`,
                accent: false,
                progress: responseRate
            },
            {
                label: 'Entretiens décrochés',
                value: String(stats.interviews),
                note: upcoming > 0 ? `${upcoming} à venir` : 'aucun de prévu',
                accent: false,
                progress: stats.sent > 0 ? Math.round((stats.interviews / stats.sent) * 100) : 0
            },
            {
                label: 'Relances à faire',
                value: String(dueRelaunch.length),
                note: lateRelaunch > 0
                    ? `dont ${lateRelaunch} en retard`
                    : dueRelaunch.length > 0 ? 'à traiter cette semaine' : 'rien en attente',
                accent: dueRelaunch.length > 0,
                progress: 0
            }
        ];
    });

    funnel = computed<FunnelStep[]>(() => {
        const stats = this.stats();
        if (!stats || stats.applications === 0) return [];
        const total = stats.applications;
        const width = (value: number) => Math.max(Math.round((value / total) * 100), 3);
        const plural = (count: number, word: string) =>
            `${count} ${word}${count > 1 ? 's' : ''}`;

        return [
            { label: plural(total, 'repérée'), width: 100, className: 'st-to_apply' },
            { label: plural(stats.sent, 'envoyée'), width: width(stats.sent), className: 'st-sent' },
            { label: plural(stats.answered, 'réponse'), width: width(stats.answered), className: 'st-interview' },
            { label: plural(stats.interviews, 'entretien'), width: width(stats.interviews), className: 'st-offer' },
            { label: plural(stats.offers, 'offre'), width: width(stats.offers), className: 'st-offer' }
        ];
    });

    // ------------------------------------------------------- rendez-vous

    upcomingInterviews = computed<Meeting[]>(() => {
        const now = new Date();
        const meetings: Meeting[] = [];

        for (const application of this.applications()) {
            const company = this.store.company(application.companyId);
            for (const event of interviewEvents(application)) {
                if (new Date(event.at) < now) continue;
                const date = new Date(event.at);
                meetings.push({
                    day: String(date.getDate()),
                    month: date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
                    title: `${application.title} — ${company?.name ?? 'entreprise non citée'}`,
                    detail: date.toLocaleDateString('fr-FR', {
                        weekday: 'long', hour: '2-digit', minute: '2-digit'
                    }),
                    applicationId: application.id
                });
            }
        }

        return meetings.sort((a, b) => Number(a.day) - Number(b.day));
    });

    // ------------------------------------------------------------- réseau

    /** Entreprises où vous connaissez quelqu'un sans avoir candidaté. */
    network = computed<NetworkRow[]>(() => {
        const applied = new Set(
            this.applications()
                .map(application => application.companyId)
                .filter((id): id is number => id !== null)
        );

        const rows: NetworkRow[] = [];
        for (const company of this.store.companies()) {
            if (applied.has(company.id)) continue;
            const contacts = this.store.contactsOfCompany(company.id);
            if (contacts.length === 0) continue;
            rows.push({
                companyId: company.id,
                name: company.name,
                contactName: contacts[0].fullName
            });
        }
        return rows;
    });

    counts = computed(() => ({
        companies: this.store.companies().length,
        contacts: this.store.contacts().length
    }));
}

// --------------------------------------------------------------------------

function daysSince(iso: string): number {
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function startOfWeek(): Date {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
}
