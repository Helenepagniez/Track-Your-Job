export interface Task {
    id: number;
    title: string;
    dueDate: Date;
    completed: boolean;
    status: 'a_faire' | 'en_cours' | 'termine';
    relatedOffer?: string;
    priority: 'haute' | 'moyenne' | 'faible';
}
