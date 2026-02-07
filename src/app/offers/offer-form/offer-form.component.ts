import { Component, EventEmitter, Input, Output, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule, MatNativeDateModule } from '@angular/material/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { JobOffer, OffersService } from '../../core/services/offers.service';

@Component({
    selector: 'app-offer-form',
    standalone: true,
    imports: [
        CommonModule,
        ReactiveFormsModule,
        MatStepperModule,
        MatFormFieldModule,
        MatInputModule,
        MatButtonModule,
        MatSelectModule,
        MatOptionModule,
        MatAutocompleteModule,
        MatDatepickerModule,
        MatNativeDateModule
    ],
    templateUrl: './offer-form.component.html',
    styleUrl: './offer-form.component.css'
})
export class OfferFormComponent implements OnInit {
    private _formBuilder = inject(FormBuilder);
    private _offersService = inject(OffersService);

    @Input() offer: JobOffer | null = null;
    @Output() save = new EventEmitter<Partial<JobOffer>>();
    @Output() cancel = new EventEmitter<void>();

    isEditing = signal(false);
    isExistingCompanySelected = signal(false);
    filteredCompanies = signal<string[]>([]);

    firstFormGroup: FormGroup = this._formBuilder.group({
        title: ['', Validators.required],
        company: ['', Validators.required],
        contractType: [''],
        contractDuration: [''],
        weeklyHours: [''],
        location: [''],
        salary: [''],
        link: ['']
    });

    secondFormGroup: FormGroup = this._formBuilder.group({
        companyDescription: [''],
        missions: [''],
        profile: ['']
    });

    thirdFormGroup: FormGroup = this._formBuilder.group({
        benefits: [''],
        recruitmentProcess: [''],
        others: [''],
        status: ['To Apply', Validators.required],
        interviewDate: [''],
        interviewType: ['']
    });

    ngOnInit() {
        // Watch for company selection to auto-populate company description
        this.firstFormGroup.get('company')?.valueChanges.subscribe(value => {
            this._filterCompanies(value || '');

            // If user selects an existing company, populate the company description
            const existingOffer = this._offersService.offers().find(o => o.company === value);
            if (existingOffer) {
                this.isExistingCompanySelected.set(true);
                if (existingOffer.companyDescription) {
                    this.secondFormGroup.patchValue({
                        companyDescription: existingOffer.companyDescription
                    });
                }
            } else {
                this.isExistingCompanySelected.set(false);
            }
        });

        // Watch for contract type changes to show/hide duration fields
        this.firstFormGroup.get('contractType')?.valueChanges.subscribe(value => {
            const durationControl = this.firstFormGroup.get('contractDuration');
            const hoursControl = this.firstFormGroup.get('weeklyHours');
            const showDurationFields = ['CDD', 'Stage', 'Freelance', 'Intérim'].includes(value);

            if (showDurationFields) {
                durationControl?.setValidators([Validators.required]);
                hoursControl?.setValidators([Validators.required]);
            } else {
                durationControl?.clearValidators();
                hoursControl?.clearValidators();
                durationControl?.setValue('');
                hoursControl?.setValue('');
            }
            durationControl?.updateValueAndValidity();
            hoursControl?.updateValueAndValidity();
        });

        // Watch for status changes to clear/set validators for interview fields
        this.thirdFormGroup.get('status')?.valueChanges.subscribe(status => {
            const dateControl = this.thirdFormGroup.get('interviewDate');
            const typeControl = this.thirdFormGroup.get('interviewType');

            if (status === 'Interview') {
                dateControl?.setValidators([Validators.required]);
                typeControl?.setValidators([Validators.required]);
            } else {
                dateControl?.clearValidators();
                typeControl?.clearValidators();

                this.thirdFormGroup.patchValue({
                    interviewDate: null,
                    interviewType: null
                });
            }
            dateControl?.updateValueAndValidity();
            typeControl?.updateValueAndValidity();
        });

        if (this.offer) {
            this.isEditing.set(true);
            this.isExistingCompanySelected.set(true);

            // Get the latest company data to ensure we have the most up-to-date information
            const companyData = this._offersService.getCompany(this.offer.company);

            this.firstFormGroup.patchValue({
                title: this.offer.title,
                company: this.offer.company,
                contractType: this.offer.contractType,
                contractDuration: this.offer.contractDuration,
                weeklyHours: this.offer.weeklyHours,
                location: this.offer.location,
                salary: this.offer.salary,
                link: this.offer.link
            });

            // Trigger value change to set validation for contract duration
            if (this.offer.contractType) {
                this.firstFormGroup.get('contractType')?.setValue(this.offer.contractType);
            }

            // Use company data if available, otherwise fall back to offer data
            this.secondFormGroup.patchValue({
                companyDescription: companyData?.info?.description || this.offer.companyDescription,
                missions: this.offer.missions,
                profile: this.offer.profile
            });

            this.thirdFormGroup.patchValue({
                benefits: this.offer.benefits,
                recruitmentProcess: this.offer.recruitmentProcess,
                others: this.offer.others,
                status: this.offer.status,
                interviewDate: this.offer.interviewDate ? new Date(this.offer.interviewDate) : null,
                interviewType: this.offer.interviewType
            });
        }
    }

    submit() {
        if (this.firstFormGroup.valid && this.thirdFormGroup.valid) {
            const step1 = this.firstFormGroup.value;
            const step2 = this.secondFormGroup.value;
            const step3 = this.thirdFormGroup.value;

            const offerData: Partial<JobOffer> = {
                title: step1.title,
                company: step1.company,
                contractType: step1.contractType,
                contractDuration: step1.contractDuration,
                weeklyHours: step1.weeklyHours,
                location: step1.location || 'Remote',
                salary: step1.salary,
                link: step1.link,

                companyDescription: step2.companyDescription,
                missions: step2.missions,
                profile: step2.profile,

                benefits: step3.benefits,
                recruitmentProcess: step3.recruitmentProcess,
                others: step3.others,
                status: step3.status || 'To Apply',
                description: step2.missions, // Fallback

                interviewDate: step3.interviewDate ? new Date(step3.interviewDate) : undefined,
                interviewType: step3.interviewType
            };

            this.save.emit(offerData);
        }
    }

    private _filterCompanies(value: string) {
        const filterValue = value.toLowerCase();

        // Get unique companies from offers
        const uniqueCompanies = Array.from(new Set(this._offersService.offers().map(o => o.company))).sort();

        if (!filterValue) {
            this.filteredCompanies.set([]);
            return;
        }

        const filtered = uniqueCompanies.filter(company => {
            const words = company.toLowerCase().split(' ');
            // Check if query matches start of any word
            return words.some(word => word.startsWith(filterValue));
        });

        this.filteredCompanies.set(filtered);
    }
}
