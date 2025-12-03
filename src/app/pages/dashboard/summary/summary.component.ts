import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-summary',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './summary.component.html',
    styleUrl: './summary.component.css'
})
export class SummaryComponent {
    stats = [
        { title: 'Candidatures', value: 12, icon: '📝', color: 'var(--primary-color)' },
        { title: 'Entretiens', value: 3, icon: '🤝', color: 'var(--accent-color)' },
        { title: 'En attente', value: 5, icon: '⏳', color: 'var(--warning-color)' },
        { title: 'Refus', value: 2, icon: '❌', color: 'var(--danger-color)' }
    ];

    recentActivities = [
        { type: 'Candidature', company: 'Google', date: 'Il y a 2 heures', status: 'Envoyé' },
        { type: 'Entretien', company: 'Amazon', date: 'Demain à 14h', status: 'Prévu' },
        { type: 'Tâche', title: 'Relancer Microsoft', date: 'Aujourd\'hui', status: 'En attente' }
    ];
}
