/**
 * Sauvegarde complète du localStorage de Track Your Job.
 * ---------------------------------------------------------------------------
 *
 * À quoi ça sert : récupérer les données de la version en ligne (elles ne
 * vivent que dans le navigateur, sur ce domaine) sous forme de fichiers JSON,
 * avant de les reprendre dans le compte Firebase.
 *
 * Mode d'emploi :
 *   1. ouvrir le site en ligne (celui où sont vos vraies candidatures) ;
 *   2. ouvrir la console du navigateur : F12, onglet « Console » ;
 *   3. si Chrome demande une confirmation pour coller, taper « allow pasting »
 *      puis Entrée ;
 *   4. coller tout le contenu de ce fichier, puis Entrée ;
 *   5. accepter les téléchargements (Chrome demande parfois l'autorisation
 *      pour plusieurs fichiers d'affilée).
 *
 * Deux fichiers sont téléchargés :
 *   - track-your-job-restauration-<date>.json
 *       le contenu exact de la clé de l'application. C'est CE fichier qu'il
 *       faut donner à « Restaurer une sauvegarde » dans l'écran Profil de la
 *       nouvelle version.
 *   - track-your-job-localstorage-complet-<date>.json
 *       tout le localStorage du domaine, clé par clé, tel quel. Copie de
 *       sécurité : à garder même après la migration.
 *
 * Ce script ne modifie rien et n'efface rien.
 */
(function exportTrackYourJobData() {
    const APP_KEY = 'track_your_job_app_data';
    const stamp = new Date().toISOString().slice(0, 10);

    // ---------------------------------------------------------- collecte
    const everything = {};
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key !== null) {
            everything[key] = localStorage.getItem(key);
        }
    }

    const raw = everything[APP_KEY];
    if (raw === undefined) {
        console.warn(
            '%cAucune donnée Track Your Job sur ce domaine.',
            'color:#9B2226;font-weight:bold'
        );
        console.warn(
            'Clés présentes : ' + (Object.keys(everything).join(', ') || '(aucune)')
        );
        console.warn(
            'Vérifiez que vous êtes bien sur l\'adresse du site en ligne, et non sur localhost.'
        );
        return;
    }

    // ------------------------------------------------------- vérification
    let parsed = null;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        console.warn(
            '%cLe contenu stocké n\'est pas du JSON lisible : on le sauvegarde tel quel.',
            'color:#7A5300;font-weight:bold'
        );
    }

    if (parsed && parsed.users) {
        console.log('%cContenu trouvé :', 'font-weight:bold');
        for (const [id, account] of Object.entries(parsed.users)) {
            const user = account && account.user ? account.user : {};
            console.log(
                '  compte ' + (user.email || id) +
                ' — ' + ((account && account.offers) || []).length + ' offre(s)' +
                ', ' + ((account && account.tasks) || []).length + ' tâche(s)' +
                ', ' + countContacts(account) + ' contact(s)'
            );
        }
        console.log('  compte actif : ' + (parsed.currentUserId || '(aucun)'));
    }

    // ------------------------------------------------------ enregistrement
    // Le fichier de restauration reprend les octets stockés, sans reformatage :
    // c'est la copie la plus fidèle possible.
    download('track-your-job-restauration-' + stamp + '.json', raw);

    const full = JSON.stringify({
        exportedAt: new Date().toISOString(),
        origin: location.origin,
        localStorage: everything
    }, null, 2);

    // Un court délai évite que le second téléchargement soit ignoré.
    setTimeout(function () {
        download('track-your-job-localstorage-complet-' + stamp + '.json', full);
    }, 600);

    console.log(
        '%c2 fichiers téléchargés (' + size(raw) + ' et ' + size(full) + ').',
        'color:#16653A;font-weight:bold'
    );
    console.log(
        'Si rien n\'est téléchargé, les téléchargements sont bloqués : la sauvegarde ' +
        'reste disponible dans la variable ci-dessous, à copier avec un clic droit ' +
        '→ « Copy object ».'
    );

    // Renvoyé pour être lisible et copiable depuis la console en cas de blocage.
    return { restauration: raw, complet: full };

    // ------------------------------------------------------------ outils

    function size(content) {
        const ko = content.length / 1024;
        return ko < 1 ? content.length + ' caractères' : ko.toFixed(1) + ' ko';
    }

    // Dans l'ancien modèle, les contacts sont rangés sous companyInfo.
    function countContacts(account) {
        if (!account || !account.offers) return 0;
        return account.offers.reduce(function (total, offer) {
            const info = (offer && offer.companyInfo) || {};
            const contacts = info.contacts || (offer && offer.contacts) || [];
            return total + contacts.length;
        }, 0);
    }

    function download(fileName, content) {
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    }
})();
