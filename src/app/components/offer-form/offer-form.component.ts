import { Component, EventEmitter, Input, Output, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatStepperModule } from '@angular/material/stepper';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';
import { JobOffer } from '../../core/services/offers.service';

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
        MatOptionModule
    ],
    styleUrl: './offer-form.component.css',
    template: `
        <div class="stepper-container">
            <mat-stepper [linear]="true" #stepper>
                <!-- Step 1: Infos Générales -->
                <mat-step [stepControl]="firstFormGroup">
                    <form [formGroup]="firstFormGroup">
                        <ng-template matStepLabel>Infos Générales</ng-template>
                        
                        <div class="form-grid">
                            <mat-form-field appearance="outline">
                                <mat-label>Titre du poste</mat-label>
                                <input matInput formControlName="title" placeholder="Ex: Développeur Angular" required>
                            </mat-form-field>

                            <mat-form-field appearance="outline">
                                <mat-label>Entreprise</mat-label>
                                <input matInput formControlName="company" placeholder="Ex: Google" required>
                            </mat-form-field>

                            <mat-form-field appearance="outline">
                                <mat-label>Type de contrat</mat-label>
                                <mat-select formControlName="contractType">
                                    <mat-option value="CDI">CDI</mat-option>
                                    <mat-option value="CDD">CDD</mat-option>
                                    <mat-option value="Freelance">Freelance</mat-option>
                                    <mat-option value="Stage">Stage</mat-option>
                                    <mat-option value="Alternance">Alternance</mat-option>
                                </mat-select>
                            </mat-form-field>

                            <mat-form-field appearance="outline">
                                <mat-label>Lieu</mat-label>
                                <input matInput formControlName="location" placeholder="Ex: Paris / Remote">
                            </mat-form-field>

                            <mat-form-field appearance="outline">
                                <mat-label>Salaire</mat-label>
                                <input matInput formControlName="salary" placeholder="Ex: 45k - 55k">
                            </mat-form-field>

                            <mat-form-field appearance="outline">
                                <mat-label>Lien de l'annonce</mat-label>
                                <input matInput formControlName="link" placeholder="https://...">
                            </mat-form-field>
                        </div>

                        <div class="stepper-actions">
                            <button mat-button matStepperNext type="button">Suivant</button>
                        </div>
                    </form>
                </mat-step>

                <!-- Step 2: Détails -->
                <mat-step [stepControl]="secondFormGroup">
                    <form [formGroup]="secondFormGroup">
                        <ng-template matStepLabel>Détails</ng-template>
                        
                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Présentation entreprise</mat-label>
                            <textarea matInput formControlName="companyDescription" rows="3"></textarea>
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Missions</mat-label>
                            <textarea matInput formControlName="missions" rows="4"></textarea>
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Profil recherché</mat-label>
                            <textarea matInput formControlName="profile" rows="3"></textarea>
                        </mat-form-field>

                        <div class="stepper-actions">
                            <button mat-button matStepperPrevious type="button">Retour</button>
                            <button mat-button matStepperNext type="button">Suivant</button>
                        </div>
                    </form>
                </mat-step>

                <!-- Step 3: Extras -->
                <mat-step [stepControl]="thirdFormGroup">
                    <form [formGroup]="thirdFormGroup">
                        <ng-template matStepLabel>Extras</ng-template>
                        
                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Avantages</mat-label>
                            <textarea matInput formControlName="benefits" rows="3"
                                placeholder="Tickets resto, mutuelle..."></textarea>
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Étapes de recrutement</mat-label>
                            <textarea matInput formControlName="recruitmentProcess" rows="3"></textarea>
                        </mat-form-field>

                        <mat-form-field appearance="outline" class="full-width">
                            <mat-label>Autres informations</mat-label>
                            <textarea matInput formControlName="others" rows="2"></textarea>
                        </mat-form-field>

                        <mat-form-field appearance="outline">
                            <mat-label>Statut initial</mat-label>
                            <mat-select formControlName="status" required>
                                <mat-option value="To Apply">À postuler</mat-option>
                                <mat-option value="Applied">En attente</mat-option>
                                <mat-option value="Interview">Entretien</mat-option>
                                <mat-option value="Offer">Offre reçue</mat-option>
                                <mat-option value="Rejected">Refusé</mat-option>
                            </mat-select>
                        </mat-form-field>

                        <div class="stepper-actions">
                            <button mat-button matStepperPrevious type="button">Retour</button>
                            <button mat-raised-button color="primary" (click)="submit()"
                                type="button">{{ isEditing() ? 'Mettre à jour' : 'Sauvegarder' }}</button>
                        </div>
                    </form>
                </mat-step>
            </mat-stepper>
        </div>
    `,
    styles: [`
        .form-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 15px;
        }
        .stepper-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
        }
        .full-width {
            width: 100%;
        }
        mat-form-field {
            width: 100%;
        }
        textarea {
            resize: vertical;
            min-height: 100px;
        }
    `]
})
export class OfferFormComponent implements OnInit {
    private _formBuilder = inject(FormBuilder);

    @Input() offer: JobOffer | null = null;
    @Output() save = new EventEmitter<Partial<JobOffer>>();
    @Output() cancel = new EventEmitter<void>();

    isEditing = signal(false);

    firstFormGroup: FormGroup = this._formBuilder.group({
        title: ['', Validators.required],
        company: ['', Validators.required],
        contractType: [''],
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
        status: ['To Apply', Validators.required]
    });

    ngOnInit() {
        if (this.offer) {
            this.isEditing.set(true);
            this.firstFormGroup.patchValue({
                title: this.offer.title,
                company: this.offer.company,
                contractType: this.offer.contractType,
                location: this.offer.location,
                salary: this.offer.salary,
                link: this.offer.link
            });
            this.secondFormGroup.patchValue({
                companyDescription: this.offer.companyDescription,
                missions: this.offer.missions,
                profile: this.offer.profile
            });
            this.thirdFormGroup.patchValue({
                benefits: this.offer.benefits,
                recruitmentProcess: this.offer.recruitmentProcess,
                others: this.offer.others,
                status: this.offer.status
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
                description: step2.missions // Fallback
            };

            this.save.emit(offerData);
        }
    }
}
