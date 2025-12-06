import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
    selector: 'app-profile-form',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './profile-form.component.html',
    styleUrls: ['./profile-form.component.css']
})
export class ProfileFormComponent implements OnChanges {
    @Input() user: any;
    @Output() save = new EventEmitter<any>();
    @Output() cancel = new EventEmitter<void>();

    formData: any = {};

    ngOnChanges(changes: SimpleChanges) {
        if (changes['user'] && this.user) {
            this.formData = { ...this.user };
        }
    }

    onSubmit() {
        this.save.emit(this.formData);
    }

    onCancel() {
        this.cancel.emit();
    }
}
