import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Campaign, CampaignSummary, currentStatus } from '../../core/models/job-search.models';
import { JobSearchStore } from '../../core/services/job-search-store.service';

/** On repose la question au bout d'un mois de silence. */
const ASK_AGAIN_AFTER_DAYS = 30;

interface ArchivedRow {
    id: number;
    name: string;
    period: string;
    summary?: CampaignSummary;
    outcomeLabel: string;
}

/**
 * Cycle de vie d'une campagne de recherche.
 *
 * Remettre les compteurs à zéro sans perdre le réseau : les entreprises et les
 * contacts vivent au-dessus des campagnes, seules les candidatures sont
 * résumées puis effacées.
 */
@Component({
    selector: 'app-campaign-panel',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './campaign-panel.component.html',
    styleUrl: './campaign-panel.component.css'
})
export class CampaignPanelComponent {
    private store = inject(JobSearchStore);

    showCloseModal = signal(false);
    showFoundJobModal = signal(false);
    newCampaignName = signal('');
    restartName = signal('');

    active = computed<Campaign | null>(() => this.store.activeCampaign());

    archived = computed<ArchivedRow[]>(() =>
        this.store.campaigns()
            .filter(campaign => campaign.status === 'closed')
            .sort((a, b) => new Date(b.closedAt ?? b.startedAt).getTime()
                - new Date(a.closedAt ?? a.startedAt).getTime())
            .map(campaign => ({
                id: campaign.id,
                name: campaign.name,
                period: periodOf(campaign),
                summary: campaign.summary,
                outcomeLabel: outcomeLabel(campaign)
            }))
    );

    /** Chiffres de la campagne en cours, tels qu'ils seront figés. */
    counts = computed(() => {
        const applications = this.store.currentApplications();
        return {
            applications: applications.length,
            sent: applications.filter(app => currentStatus(app) !== 'to_apply').length,
            days: daysSince(this.active()?.startedAt)
        };
    });

    kept = computed(() => ({
        companies: this.store.companies().length,
        contacts: this.store.contacts().length
    }));

    /** Nombre de jours depuis la dernière réponse à « toujours en recherche ? ». */
    sinceCheck = computed<number | null>(() => {
        const campaign = this.active();
        if (!campaign?.lastCheckedAt) return null;
        return daysSince(campaign.lastCheckedAt);
    });

    shouldAsk = computed(() => {
        const since = this.sinceCheck();
        return since === null || since >= ASK_AGAIN_AFTER_DAYS;
    });

    // --------------------------------------------------------------- actions

    stillSearching(): void {
        this.store.markSearchChecked(true);
    }

    askFoundJob(): void {
        this.showFoundJobModal.set(true);
    }

    cancelFoundJob(): void {
        this.showFoundJobModal.set(false);
    }

    confirmFoundJob(): void {
        this.store.markSearchChecked(false);
        this.showFoundJobModal.set(false);
    }

    openCloseModal(): void {
        this.newCampaignName.set('');
        this.showCloseModal.set(true);
    }

    cancelClose(): void {
        this.showCloseModal.set(false);
    }

    confirmClose(): void {
        const name = this.newCampaignName().trim();
        this.store.closeActiveCampaign('paused');
        if (name) {
            this.store.startCampaign(name);
        }
        this.showCloseModal.set(false);
    }

    restart(): void {
        const name = this.restartName().trim() || defaultCampaignName();
        this.store.startCampaign(name);
        this.restartName.set('');
    }

    suggestedName(): string {
        return defaultCampaignName();
    }
}

// --------------------------------------------------------------------------

function daysSince(iso?: string): number {
    if (!iso) return 0;
    return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

function monthYear(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}

function periodOf(campaign: Campaign): string {
    const from = monthYear(campaign.startedAt);
    const to = campaign.closedAt ? monthYear(campaign.closedAt) : null;
    return to && to !== from ? `${from} → ${to}` : from;
}

function outcomeLabel(campaign: Campaign): string {
    switch (campaign.outcome) {
        case 'found_job': return 'poste trouvé';
        case 'paused': return 'mise en pause';
        default: return 'clôturée';
    }
}

function defaultCampaignName(): string {
    const now = new Date();
    const month = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    return `Recherche · ${month}`;
}
