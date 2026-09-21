export interface Task {
    id: number;
    title: string;
    dueDate: Date;
    completed: boolean;
    status: 'a_faire' | 'en_cours' | 'termine';
    priority: 'haute' | 'moyenne' | 'faible';
    /**
     * Candidatures concernées, par identifiant. Remplace `relatedOffers` :
     * un lien par identifiant survit à un changement d'intitulé ou
     * d'entreprise, ce que le libellé figé ne faisait pas.
     */
    applicationIds?: number[];
    /** Campagne d'origine : une clôture n'efface que ses propres tâches. */
    campaignId?: number;
    link?: string;
    /**
     * Ancien champ : libellé figé « Poste - Entreprise - Statut ». Conservé
     * pour les tâches que la migration n'a pas su rattacher.
     */
    relatedOffers?: string[];
}
