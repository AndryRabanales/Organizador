import { useState } from 'react';

type Language = 'en' | 'es';

const LOCALE_DATA = {
    en: {
        // Days
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        // UI
        time: 'TIME',
        newLabel: 'New Label',
        sizeLayout: 'Size & Layout',
        addStory: 'Add Story',
        clear: 'Clear',
        range: 'RANGE',
        step: 'STEP',
        startHour: 'Start Hour',
        endHour: 'End Hour',
        minutes: 'Min',
        manageLabels: 'Manage Labels',
        stories: 'Stories',
        createStory: 'Create Story',
        title: 'Title',
        description: 'Description',
        cancel: 'Cancel',
        save: 'Save',
        deleteStory: 'Delete Story',
        done: 'Done',
        close: 'Close',
        viewingMode: 'Viewing Mode',
        settings: 'Settings',
        configureSchedule: 'Configure Schedule',
        clearSchedule: 'Clear Entire Schedule',
        confirmClear: 'Are you sure? This will delete ALL entries.',
        syncing: 'Syncing Database...',
        readOnly: 'Read Only',
        notes: 'Notes',
        notesManagement: 'Notes Management',
        globalGuidelines: 'Global Guidelines',
        specificNote: 'Specific Note for this Block',
        scratchpad: 'Scratchpad',
        closeSave: 'Close & Save',
        // New
        settingsOpen: 'Open Settings',
        settingsClose: 'Close Settings',
        appTitle: 'BIO',
        planner: 'PLANNER',
        confirmAction: 'Confirm Action',
        yesDelete: 'Yes, Delete',
        trash: 'Trash (Restore or Delete)',
        trashEmpty: 'Trash is empty.',
        restore: 'Restore',
        deleteForever: 'Delete Forever',
        confirmDeleteTab: 'Delete this tab permanently?',
        confirmCloseTab: 'Are you sure you want to close this tab? It will be moved to Trash.',
        customNote: 'Custom Note',
        writeNotes: 'Write your notes here...',
        globalConfig: 'Global Config',
        thisBlock: 'This Block',
        thisSpecificBlock: 'This Specific Block',
        logout: 'Logout',
        deleteLabel: 'Delete Label?',
        day: 'Day',
        storyPlaceholder: 'Meeting, Workout, etc.',
        storyDescPlaceholder: 'Add details here...',
        subtitle: 'Professional Organization Suite',
        continueGoogle: 'Continue with Google',
        connecting: 'Connecting...',
        secureBadge: 'Secure Encryption via Supabase',
        copyright: 'BIO Organizer System',
        editingMode: 'Editing Mode'
    },
    es: {
        // Days
        days: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
        // UI
        time: 'HORA',
        newLabel: 'Nueva Etiqueta',
        sizeLayout: 'Tamaño y Diseño',
        addStory: 'Añadir Historia',
        clear: 'Limpiar',
        range: 'RANGO',
        step: 'PASO',
        startHour: 'Hora Inicio',
        endHour: 'Hora Fin',
        minutes: 'Min',
        manageLabels: 'Gestionar Etiquetas',
        stories: 'Historias',
        createStory: 'Crear Historia',
        title: 'Título',
        description: 'Descripción',
        cancel: 'Cancelar',
        save: 'Guardar',
        deleteStory: 'Borrar Historia',
        done: 'Listo',
        close: 'Cerrar',
        viewingMode: 'Modo Visualización',
        settings: 'Ajustes',
        configureSchedule: 'Configurar Horario',
        clearSchedule: 'Borrar Todo el Horario',
        confirmClear: '¿Estás seguro? Esto borrará TODAS las entradas.',
        syncing: 'Sincronizando Base de Datos...',
        readOnly: 'Solo Lectura',
        notes: 'Notas',
        notesManagement: 'Gestión de Notas',
        globalGuidelines: 'Guías Globales',
        specificNote: 'Nota Específica para este Bloque',
        scratchpad: 'Bloc de Notas',
        closeSave: 'Cerrar y Guardar',
        // New
        settingsOpen: 'Abrir Ajustes',
        settingsClose: 'Cerrar Ajustes',
        appTitle: 'BIO',
        planner: 'PLANIFICADOR',
        confirmAction: 'Confirmar Acción',
        yesDelete: 'Sí, Borrar',
        trash: 'Papelera (Restaurar o Eliminar)',
        trashEmpty: 'La papelera está vacía.',
        restore: 'Restaurar',
        deleteForever: 'Eliminar Permanentemente',
        confirmDeleteTab: '¿Eliminar esta pestaña permanentemente?',
        confirmCloseTab: '¿Seguro que quieres cerrar esta pestaña? Se moverá a la Papelera.',
        customNote: 'Nota Personalizada',
        writeNotes: 'Escribe tus notas aquí...',
        globalConfig: 'Configuración Global',
        thisBlock: 'Este Bloque',
        thisSpecificBlock: 'Este Bloque Específico',
        logout: 'Cerrar Sesión',
        deleteLabel: '¿Borrar Etiqueta?',
        day: 'Día',
        storyPlaceholder: 'Reunión, Entreno, etc.',
        storyDescPlaceholder: 'Añade detalles aquí...',
        subtitle: 'Suite de Organización Profesional',
        continueGoogle: 'Continuar con Google',
        connecting: 'Conectando...',
        secureBadge: 'Encriptación Segura vía Supabase',
        copyright: 'Sistema Organizador BIO',
        editingMode: 'Modo Edición'
    }
};

export function useLanguage() {
    // Default to 'es'
    const [language, setLanguage] = useState<Language>('es');

    // Removed auto-detection to enforce Spanish
    /*
    useEffect(() => {
        const handler = () => {
            const browserLang = navigator.language.split('-')[0];
            setLanguage(browserLang === 'es' ? 'es' : 'en');
        };
        window.addEventListener('languagechange', handler);
        return () => window.removeEventListener('languagechange', handler);
    }, []);
    */

    const t = (key: keyof typeof LOCALE_DATA['en']): string => {
        const value = LOCALE_DATA[language][key];
        if (Array.isArray(value)) return key; // Should not happen if we only use t for strings
        return value || key;
    };

    const days = LOCALE_DATA[language].days;

    return {
        language,
        setLanguage,
        t,
        days
    };
}
