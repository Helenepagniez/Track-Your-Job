import { Injectable, computed, inject } from '@angular/core';
import { Task } from '../../tasks/task.model';
import { UserDataService } from './user-data.service';

/**
 * Les tâches vivent dans le même document que le reste, et passent par le
 * même écrivain : deux services ne peuvent plus s'écraser mutuellement.
 */
@Injectable({
    providedIn: 'root'
})
export class TasksService {
    private userData = inject(UserDataService);

    tasks = computed<Task[]>(() => this.userData.data()?.tasks ?? []);

    private write(next: Task[]): void {
        this.userData.update(data => ({ ...data, tasks: next }));
    }

    addTask(task: Task): void {
        this.write([task, ...this.tasks()]);
    }

    setTasks(tasks: Task[]): void {
        this.write(tasks);
    }

    updateTask(updated: Task): void {
        this.write(this.tasks().map(task => (task.id === updated.id ? updated : task)));
    }

    deleteTask(id: number): void {
        this.write(this.tasks().filter(task => task.id !== id));
    }

    toggleTask(id: number): void {
        this.write(this.tasks().map(task => {
            if (task.id !== id) return task;
            const completed = !task.completed;
            return { ...task, completed, status: completed ? 'termine' : 'a_faire' };
        }));
    }

    updateTaskStatus(id: number, status: Task['status']): void {
        this.write(this.tasks().map(task =>
            task.id === id
                ? { ...task, status, completed: status === 'termine' }
                : task
        ));
    }
}
