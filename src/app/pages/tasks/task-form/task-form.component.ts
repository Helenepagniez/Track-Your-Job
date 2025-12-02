import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task } from '../task.model';

@Component({
    selector: 'app-task-form',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './task-form.component.html',
    styleUrl: './task-form.component.css'
})
export class TaskFormComponent implements OnInit {
    @Input() task: Task | null = null;
    @Output() save = new EventEmitter<Partial<Task>>();
    @Output() cancel = new EventEmitter<void>();

    formData: Partial<Task> = {
        priority: 'moyenne',
        status: 'a_faire',
        dueDate: new Date()
    };

    ngOnInit() {
        if (this.task) {
            this.formData = { ...this.task };
            // Ensure date is a Date object if it comes as string, though interface says Date
            if (this.formData.dueDate) {
                this.formData.dueDate = new Date(this.formData.dueDate);
            }
        }
    }

    onSubmit() {
        if (this.formData.title) {
            this.save.emit(this.formData);
        }
    }

    onCancel() {
        this.cancel.emit();
    }
}
