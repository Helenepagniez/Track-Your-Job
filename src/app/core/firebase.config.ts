// Ces fonctions utilisent le SDK Firebase directement : les mêmes fonctions
// réexportées par @angular/fire attendent un contexte d'injection Angular.
import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { Firestore, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
// La fonction de lecture d'annonce est déployée en Europe : le client doit
// viser la même région, sinon l'appel part vers us-central1.
import { Functions, getFunctions } from 'firebase/functions';

/**
 * Configuration Firebase du projet.
 *
 * Ces valeurs sont **publiques par conception** : elles identifient le projet,
 * elles n'autorisent rien. N'importe qui peut les lire dans le JavaScript
 * livré au navigateur, et c'est prévu ainsi.
 *
 * Ce qui protège réellement les données, ce sont :
 *  - les règles Firestore (`firestore.rules`), qui n'autorisent un utilisateur
 *    qu'à lire et écrire son propre document ;
 *  - la liste des domaines autorisés, dans Authentication → Settings.
 */
export const firebaseConfig = {
    apiKey: 'AIzaSyBYCzifFXYTeHoX5xnv2FmA6nMfb9HOlYY',
    authDomain: 'track-your-job.firebaseapp.com',
    projectId: 'track-your-job',
    storageBucket: 'track-your-job.firebasestorage.app',
    messagingSenderId: '510264323910',
    appId: '1:510264323910:web:aaca05b3ae0a4c91797f47'
};

/**
 * Application Firebase, créée à la demande.
 *
 * Les fabriques passées à `provideFirebaseApp`, `provideAuth` et
 * `provideFirestore` ne sont pas appelées dans un ordre garanti : chacune
 * passe par ici plutôt que par `getApp()`, qui échouerait si elle est la
 * première à s'exécuter.
 */
export function firebaseApp(): FirebaseApp {
    return getApps()[0] ?? initializeApp(firebaseConfig);
}

/**
 * Base Firestore, créée à la demande elle aussi. `initializeFirestore` ne peut
 * être appelée qu'une seule fois par application.
 */
export function firebaseFirestore(): Firestore {
    if (!firestore) {
        firestore = initializeFirestore(firebaseApp(), {
            // Le modèle utilise beaucoup de champs optionnels ; sans cette
            // option, Firestore refuse toute écriture contenant un `undefined`.
            ignoreUndefinedProperties: true,
            // Cache local : l'application fonctionne hors ligne et se
            // resynchronise au retour du réseau.
            localCache: persistentLocalCache()
        });
    }
    return firestore;
}

let firestore: Firestore | null = null;

export const FUNCTIONS_REGION = 'europe-west1';

/** Fonctions Firebase, dans la région où elles sont déployées. */
export function firebaseFunctions(): Functions {
    return getFunctions(firebaseApp(), FUNCTIONS_REGION);
}
