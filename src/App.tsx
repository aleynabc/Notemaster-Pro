/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Palette, 
  Settings, 
  X, 
  ChevronLeft, 
  Bell, 
  BellOff,
  Check,
  Calendar,
  User,
  Tag,
  Package,
  ListTodo,
  DollarSign,
  StickyNote,
  RotateCcw,
  Star,
  MapPin
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format, parseISO, isBefore, addDays, startOfDay, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Note, AppSettings } from './types';
import { cn } from './lib/utils';

const COLORS = [
  '#FFFFFF', '#FEE2E2', '#FEF3C7', '#D1FAE5', '#DBEAFE', '#E0E7FF', '#F5F3FF', '#FCE7F3', '#F3F4F6', '#111827'
];

// Web ve Capacitor uyumlu Responsive Hook
function useWindowDimensions() {
  const [dimensions, setDimensions] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return dimensions;
}

// Bildirim ID'lerini not ID'sine göre üreten benzersiz bir fonksiyon
const generateNotificationId = (noteId: string, offset: number) => {
  let hash = 0;
  for (let i = 0; i < noteId.length; i++) {
    hash = (hash << 5) - hash + noteId.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) + offset;
};

export default function App() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height; // Genişlik yükseklikten büyükse yataydadır.

  // State
  const [notes, setNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('eklenen_notlar');
    return saved ? JSON.parse(saved) : [];
  });
  const [deletedNotes, setDeletedNotes] = useState<Note[]>(() => {
    const saved = localStorage.getItem('silinen_notlar');
    return saved ? JSON.parse(saved) : [];
  });
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = localStorage.getItem('settings');
    return saved ? JSON.parse(saved) : { highContrast: false, notificationsEnabled: false };
  });

  const [view, setView] = useState<'home' | 'deleted' | 'settings'>('home');
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState<string | null>(null);

  // Sorting Logic
  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      if (a.isPaid !== b.isPaid) return a.isPaid ? 1 : -1;
      if (a.isStarred !== b.isStarred) return a.isStarred ? -1 : 1;
      if (a.isStarred && b.isStarred) return (b.starredAt || 0) - (a.starredAt || 0);
      const dateA = a.dateTime ? new Date(a.dateTime).getTime() : a.createdAt;
      const dateB = b.dateTime ? new Date(b.dateTime).getTime() : b.createdAt;
      return dateB - dateA;
    });
  }, [notes]);

  const sortedDeletedNotes = useMemo(() => {
    return [...deletedNotes].sort((a, b) => {
      const dateA = a.dateTime ? new Date(a.dateTime).getTime() : a.createdAt;
      const dateB = b.dateTime ? new Date(b.dateTime).getTime() : b.createdAt;
      return dateB - dateA;
    });
  }, [deletedNotes]);

  // Persistence
  useEffect(() => {
    localStorage.setItem('eklenen_notlar', JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    localStorage.setItem('silinen_notlar', JSON.stringify(deletedNotes));
  }, [deletedNotes]);

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  // Yeni Zamanlanmış (Arka plan/Kapalı Uygulama) Bildirim Mantığı
  const scheduleNotificationsForNote = async (note: Note) => {
    // 1. Ayar kapalıysa veya ödenmişse veya tarih yoksa çık
    if (!settings.notificationsEnabled || !note.dateTime || note.isPaid) return;

    const targetDate = new Date(note.dateTime).getTime();
    const now = new Date().getTime();

    // Sabitler (Milisaniye cinsinden)
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const ONE_HOUR = 60 * 60 * 1000;

    // 2. Triggers listesini güncelle (Sıkboğaz etmeyecek aralıklı planlama)
    const triggers = [
      { time: new Date(targetDate - 7 * ONE_DAY), msg: 'Teslimata 1 hafta kaldı!' },
      { time: new Date(targetDate - 3 * ONE_DAY), msg: 'Teslimata 3 gün kaldı!' },
      { time: new Date(targetDate - 1 * ONE_DAY), msg: 'Yarın teslim edilecek!' },
      { time: new Date(targetDate - 4 * ONE_HOUR), msg: 'Teslimata son 4 saat!' },
      { time: new Date(targetDate - 1 * ONE_HOUR), msg: 'Son 1 saat, yaklaşıyor!' },
    ].filter(t => t.time.getTime() > now); // Sadece şu andan ileri bir tarihte olanları planla

    if (triggers.length === 0) return;

    try {
      const notifications = triggers.map((t, index) => ({
        title: 'Yaklaşan Sipariş',
        // Hangi not olduğu müşteri ismi ve konsept ile açıkça belirtiliyor
        body: `${note.customerName} (${note.concept}): ${t.msg}`,
        // ID çakışmasını önlemek için note.id ve index kullanıyoruz
        id: generateNotificationId(note.id, index), 
        schedule: { at: t.time, allowWhileIdle: true }, // allowWhileIdle uyku modunda çalışmasını sağlar
        channelId: 'high_importance_channel',
        smallIcon: 'ic_launcher',
      }));

      await LocalNotifications.schedule({ notifications });
      console.log("Bildirimler başarıyla planlandı:", notifications);
    } catch (error) {
      console.error("Bildirim planlanırken hata oluştu:", error);
    }
  };

  const cancelNotificationsForNote = async (note: Note) => {
    // 5 farklı bildirim zamanı planladığımız için 0, 1, 2, 3, 4 indekslerinin tamamını siliyoruz.
    const ids = [0, 1, 2, 3, 4].map(index => ({ id: generateNotificationId(note.id, index) }));
    await LocalNotifications.cancel({ notifications: ids });
  };

  // Kanal ve İlk İzin Ayarı
  useEffect(() => {
    const setupNotifications = async () => {
      if (settings.notificationsEnabled) {
        // Kilit ekranında görünmesi için yüksek öncelikli (importance: 5, visibility: 1) kanal oluşturma
        await LocalNotifications.createChannel({
          id: 'high_importance_channel',
          name: 'Önemli Sipariş Hatırlatıcıları',
          description: 'Yaklaşan siparişler için kilit ekranı ve sesli uyarılar',
          importance: 5,
          visibility: 1, // Kilit ekranında herkese açık göster
        });

        // Uygulama açıldığında tüm aktif notları baştan planla (Senkronizasyon)
        notes.forEach(note => scheduleNotificationsForNote(note));
      } else {
        // Bildirimler kapatıldıysa bekleyen tüm zamanlanmış görevleri iptal et
        const pending = await LocalNotifications.getPending();
        if (pending.notifications.length > 0) {
          await LocalNotifications.cancel(pending);
        }
      }
    };
    setupNotifications();
  }, [settings.notificationsEnabled]);


  // Handlers (Bildirim Planlaması eklendi)
  const addNote = async (newNote: Omit<Note, 'id' | 'createdAt'>) => {
    const note: Note = {
      ...newNote,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    setNotes([note, ...notes]);
    setIsNoteModalOpen(false);
    await scheduleNotificationsForNote(note);
  };

  const updateNote = async (updatedNote: Note) => {
    setNotes(notes.map(n => n.id === updatedNote.id ? updatedNote : n));
    setEditingNote(null);
    setIsNoteModalOpen(false);
    await cancelNotificationsForNote(updatedNote); // Eskileri sil
    await scheduleNotificationsForNote(updatedNote); // Yenilerini planla
  };

  const deleteNote = async (id: string) => {
    const noteToDelete = notes.find(n => n.id === id);
    if (noteToDelete) {
      setNotes(notes.filter(n => n.id !== id));
      setDeletedNotes([noteToDelete, ...deletedNotes]);
      await cancelNotificationsForNote(noteToDelete); // Bildirimleri iptal et
    }
  };

  const deleteAllNotes = () => {
    if (notes.length === 0) return;
    notes.forEach(n => cancelNotificationsForNote(n)); // Tüm bildirimleri sil
    setDeletedNotes([...notes, ...deletedNotes]);
    setNotes([]);
  };

  const restoreNote = async (id: string) => {
    const noteToRestore = deletedNotes.find(n => n.id === id);
    if (noteToRestore) {
      setDeletedNotes(deletedNotes.filter(n => n.id !== id));
      setNotes([noteToRestore, ...notes]);
      await scheduleNotificationsForNote(noteToRestore); // Bildirimleri geri getir
    }
  };

  const permanentlyDeleteNote = (id: string) => {
    setDeletedNotes(deletedNotes.filter(n => n.id !== id));
  };

  const emptyTrash = () => {
    setDeletedNotes([]);
    localStorage.removeItem('silinen_notlar');
  };

  const changeNoteColor = (id: string, color: string) => {
    setNotes(notes.map(n => n.id === id ? { ...n, color } : n));
    setIsColorPickerOpen(null);
  };

  const toggleStar = (id: string) => {
    setNotes(notes.map(n => {
      if (n.id === id) {
        const isStarred = !n.isStarred;
        return {
          ...n,
          isStarred,
          starredAt: isStarred ? Date.now() : undefined
        };
      }
      return n;
    }));
  };

  const togglePaid = (id: string) => {
    setNotes(notes.map(n => {
      if (n.id === id) {
        const isPaid = !n.isPaid;
        const updatedNote = { ...n, isPaid, paidAt: isPaid ? Date.now() : undefined };
        
        // Eğer ödendi olarak işaretlendiyse o notun gelecek bildirimlerini sil
        if (isPaid) cancelNotificationsForNote(updatedNote);
        else scheduleNotificationsForNote(updatedNote);
        
        return updatedNote;
      }
      return n;
    }));
  };

  // Renderers
  const renderHome = () => (
    <div className="flex flex-col h-full pb-24">
      <header className="flex justify-between items-center p-6 bg-transparent">
        <div className="flex items-center gap-4">
          <h1 className={cn("text-2xl font-bold tracking-tight", settings.highContrast ? "text-white" : "text-gray-900")}>
            Siparişlerim
          </h1>
          {notes.length > 0 && (
            <button 
              onClick={deleteAllNotes}
              className="text-xs font-bold text-red-500 hover:text-red-600 transition-colors bg-red-50 px-3 py-1.5 rounded-lg"
            >
              Tümünü Sil
            </button>
          )}
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => setView('settings')}
            className={cn("p-2 rounded-full transition-colors", settings.highContrast ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-600")}
          >
            <Settings size={24} />
          </button>
          <button 
            onClick={() => setView('deleted')}
            className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors"
          >
            <Trash2 size={24} />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pb-6">
        {sortedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-40 w-full min-h-[16rem]">
            <StickyNote size={64} className={settings.highContrast ? "text-white" : "text-gray-400"} />
            <p className={cn("mt-4 font-medium text-center", settings.highContrast ? "text-white" : "text-gray-500")}>Henüz sipariş eklemediniz.</p>
          </div>
        ) : (
          <div 
            style={
              isLandscape 
                // Yatay Mod (Grid Sistemi): Genişliğe göre sığabildiği kadar minimum 280px'lik kolonlar oluşturur ve kalan boşluğu eşit paylaştırır.
                ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', alignItems: 'stretch' }
                // Dikey Mod (Flex Sistemi): Alt alta dizer.
                : { display: 'flex', flexDirection: 'column', gap: '16px' }
            }
          >
            {sortedNotes.map((note: Note) => (
              <NoteCard 
                key={note.id} 
                note={note} 
                onEdit={() => { setEditingNote(note); setIsNoteModalOpen(true); }}
                onDelete={() => deleteNote(note.id)}
                onColorClick={() => setIsColorPickerOpen(note.id)}
                onToggleStar={() => toggleStar(note.id)}
                onTogglePaid={() => togglePaid(note.id)}
                highContrast={settings.highContrast}
              />
            ))}
          </div>
        )}
      </main>

      <button 
        onClick={() => { setEditingNote(null); setIsNoteModalOpen(true); }}
        className={cn(
          "absolute bottom-10 right-8 w-16 h-16 rounded-2xl shadow-2xl flex items-center justify-center transition-all z-40 active:scale-90 hover:scale-105",
          settings.highContrast 
            ? "bg-white text-black shadow-white/10" 
            : "bg-blue-600 text-white shadow-blue-500/40"
        )}
      >
        <Plus size={32} strokeWidth={3} />
      </button>
    </div>
  );

  const renderDeleted = () => (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between p-6 gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('home')} className={cn("p-2 rounded-full", settings.highContrast ? "text-white hover:bg-gray-800" : "text-gray-900 hover:bg-gray-100")}>
            <ChevronLeft size={24} />
          </button>
          <h1 className={cn("text-2xl font-bold", settings.highContrast ? "text-white" : "text-gray-900")}>Silinenler</h1>
        </div>
        {deletedNotes.length > 0 && (
          <button 
            onClick={emptyTrash}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 transition-colors shadow-sm"
          >
            <Trash2 size={16} />
            Sayfayı Boşalt
          </button>
        )}
      </header>
      <main className="flex-1 overflow-y-auto px-6 pb-6">
        {sortedDeletedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-40 w-full min-h-[16rem]">
            <Trash2 size={64} className={settings.highContrast ? "text-white" : "text-gray-400"} />
            <p className={cn("mt-4 font-medium text-center", settings.highContrast ? "text-white" : "text-gray-500")}>Silinen Notunuz Bulunmamaktadır.</p>
          </div>
        ) : (
          <div 
            style={
              isLandscape 
                // Yatay Mod (Grid Sistemi): Ekranın yatay genişliğine göre boyutlanır
                ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', alignItems: 'stretch' }
                // Dikey Mod
                : { display: 'flex', flexDirection: 'column', gap: '16px' }
            }
          >
            {sortedDeletedNotes.map(note => (
              <DeletedNoteCard 
                key={note.id} 
                note={note} 
                onRestore={() => restoreNote(note.id)}
                onPermanentDelete={() => permanentlyDeleteNote(note.id)}
                highContrast={settings.highContrast}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );

  const renderSettings = () => (
    <div className="flex flex-col h-full">
      <header className="flex items-center p-6 gap-4">
        <button onClick={() => setView('home')} className={cn("p-2 rounded-full", settings.highContrast ? "text-white hover:bg-gray-800" : "text-gray-900 hover:bg-gray-100")}>
          <ChevronLeft size={24} />
        </button>
        <h1 className={cn("text-2xl font-bold", settings.highContrast ? "text-white" : "text-gray-900")}>Ayarlar</h1>
      </header>
      <main className={cn("flex-1 px-6 space-y-6", isLandscape && "max-w-2xl mx-auto w-full")}>
        <div className={cn(
          "p-6 rounded-3xl space-y-6 border transition-all", 
          settings.highContrast ? "bg-gray-800 border-gray-600 border-2" : "bg-white shadow-sm border-gray-100"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 text-purple-600 rounded-xl">
                <Palette size={20} />
              </div>
              <div>
                <p className={cn("font-semibold", settings.highContrast ? "text-white" : "text-gray-900")}>Yüksek Kontrast</p>
                <p className="text-xs text-gray-500">Koyu tema ve yüksek okunabilirlik</p>
              </div>
            </div>
            <button 
              onClick={() => setSettings({ ...settings, highContrast: !settings.highContrast })}
              className={cn(
                "w-12 h-6 rounded-full transition-colors relative",
                settings.highContrast ? "bg-blue-600" : "bg-gray-200"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full transition-transform",
                settings.highContrast ? "translate-x-7" : "translate-x-1"
              )} />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-xl">
                <Bell size={20} />
              </div>
              <div>
                <p className={cn("font-semibold", settings.highContrast ? "text-white" : "text-gray-900")}>Bildirimleri Aç</p>
                <p className="text-xs text-gray-500">Kilit ekranı ve arka plan hatırlatıcıları</p>
              </div>
            </div>
            <button 
              onClick={async () => {
                if (!settings.notificationsEnabled) {
                  const permission = await LocalNotifications.requestPermissions();
                  if (permission.display !== 'granted') {
                    alert('Bildirim izni reddedildi. Cihaz ayarlarından açmanız gerekebilir.');
                    return; 
                  }
                }
                setSettings(prev => ({ ...prev, notificationsEnabled: !prev.notificationsEnabled }));
              }}
              className={cn(
                "w-12 h-6 rounded-full transition-all duration-300 relative",
                settings.notificationsEnabled ? "bg-blue-600 shadow-inner" : "bg-gray-300"
              )}
            >
              <div className={cn(
                "absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-300",
                settings.notificationsEnabled ? "translate-x-7" : "translate-x-1"
              )} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );

  return (
    <div className={cn(
      "min-h-screen transition-colors duration-300 font-sans select-none flex items-center justify-center p-0", 
      settings.highContrast ? "bg-black" : "bg-gray-100",
      !isLandscape && "sm:p-4" // Sadece dikey modda dış boşluk bırak
    )}>
      <div className={cn(
        "relative overflow-hidden flex flex-col transition-all w-full h-[100dvh]",
        isLandscape 
          ? "max-w-none rounded-none border-0" // Yatay (Tablet/Web) görünüm - Tam ekran
          : "max-w-md sm:h-[90vh] sm:rounded-[3rem] rounded-none sm:border-4 border-0", // Dikey (Mobil) Görünüm - Çerçeveli
        settings.highContrast ? "bg-black border-gray-800" : "bg-white border-gray-200 shadow-none sm:shadow-2xl"
      )}>
        {view === 'home' && renderHome()}
        {view === 'deleted' && renderDeleted()}
        {view === 'settings' && renderSettings()}

        {/* Note Modal */}
        <AnimatePresence>
          {isNoteModalOpen && (
            <NoteModal 
              note={editingNote} 
              onClose={() => setIsNoteModalOpen(false)} 
              onSave={editingNote ? updateNote : addNote}
              highContrast={settings.highContrast}
              isLandscape={isLandscape}
            />
          )}
        </AnimatePresence>

        {/* Color Picker Modal */}
        <AnimatePresence>
          {isColorPickerOpen && (
            <ColorPickerModal 
              currentColor={notes.find(n => n.id === isColorPickerOpen)?.color || '#FFFFFF'}
              onClose={() => setIsColorPickerOpen(null)}
              onSelect={(color) => changeNoteColor(isColorPickerOpen, color)}
              highContrast={settings.highContrast}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

interface NoteCardProps {
  note: Note;
  onEdit: () => void;
  onDelete: () => void;
  onColorClick: () => void;
  onToggleStar: () => void;
  onTogglePaid: () => void;
  highContrast: boolean;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, onEdit, onDelete, onColorClick, onToggleStar, onTogglePaid, highContrast }) => {
  const displayColor = (note.color === '#111827' && highContrast) ? '#FFFFFF' : note.color;
  const isDarkColor = note.color === '#111827' && !highContrast;
  const textColor = isDarkColor ? 'text-white' : 'text-gray-900';
  const mutedTextColor = isDarkColor ? 'text-gray-300' : 'text-gray-500';

  // Acil Durum Kontrol Fonksiyonu (1 saatten az kaldıysa ve geçmişe gitmediyse)
  const isUrgent = (targetDate: any) => {
    if (!targetDate) return false;
    const diff = new Date(targetDate).getTime() - new Date().getTime(); 
    return diff > 0 && diff < 3600000; 
  };

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: note.isPaid ? 0.6 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "group relative rounded-3xl p-5 shadow-sm border transition-all hover:shadow-md w-full h-full", // h-full eklendi: grid içinde eşit yükseklik için
        note.isPaid && "grayscale-[0.5]",
        isUrgent(note.dateTime) && "border-red-500 shadow-red-100" // Acil durum stili
      )}
      style={{ 
        backgroundColor: displayColor, 
        borderColor: isUrgent(note.dateTime) ? 'red' : (highContrast ? '#374151' : 'rgba(0,0,0,0.05)'),
        borderWidth: isUrgent(note.dateTime) ? '2px' : (highContrast ? '2px' : '1px'),
      }}
    >
      {note.isPaid && (
        <div className="absolute top-2 right-14 px-2 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded-full shadow-sm z-10">
          ÖDEME ALINDI
        </div>
      )}

      <div className="absolute top-4 left-4 flex flex-col gap-2">
        <button 
          onClick={onToggleStar}
          className={cn(
            "p-1.5 rounded-full transition-all transform active:scale-90",
            note.isStarred 
              ? "bg-yellow-400 text-white shadow-sm" 
              : (isDarkColor ? "bg-white/10 text-white/40" : "bg-black/5 text-gray-400")
          )}
        >
          <Star size={16} fill={note.isStarred ? "currentColor" : "none"} />
        </button>
        <button 
          onClick={onColorClick}
          className={cn(
            "p-1.5 rounded-full transition-opacity",
            isDarkColor ? "bg-white/10 text-white" : "bg-black/5 text-gray-600"
          )}
        >
          <Palette size={16} />
        </button>
      </div>

      <div className="flex justify-between items-start pl-10 pr-2">
        <div className={cn("flex-1", note.isPaid && "line-through decoration-2 decoration-green-500/50")}>
          <h3 className={cn("font-bold text-xl leading-tight", textColor)}>{note.customerName}</h3>
          {/* Acil Durum Uyarı Metni */}
          {isUrgent(note.dateTime) && !note.isPaid && <p style={{color: 'red', fontWeight: 'bold', fontSize: '13px', marginTop: '4px'}}>⚠️ Süre Dolmak Üzere!</p>}
          <div className="flex items-center gap-1.5 mt-1">
            <Calendar size={12} className={mutedTextColor} />
            <p className={cn("text-xs font-medium", mutedTextColor)}>
              {note.dateTime ? format(parseISO(note.dateTime), 'd MMMM yyyy, HH:mm', { locale: tr }) : 'Tarih belirtilmedi'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onEdit} className={cn("p-2 rounded-full transition-colors", isDarkColor ? "hover:bg-white/10 text-white" : "hover:bg-black/5 text-blue-600")}>
            <Edit2 size={18} />
          </button>
          <button onClick={onDelete} className={cn("p-2 rounded-full transition-colors", isDarkColor ? "hover:bg-red-500/20 text-red-400" : "hover:bg-red-50 text-red-500")}>
            <Trash2 size={18} />
          </button>
          <button 
            onClick={onTogglePaid} 
            className={cn(
              "p-2 rounded-full transition-all transform active:scale-90",
              note.isPaid 
                ? "bg-green-500 text-white shadow-md" 
                : (isDarkColor ? "hover:bg-green-500/20 text-green-400" : "hover:bg-green-50 text-green-600")
            )}
          >
            <DollarSign size={18} />
          </button>
        </div>
      </div>

      <div className={cn("mt-4 space-y-2", note.isPaid && "line-through decoration-1 decoration-green-500/30")}>
        <div className="flex gap-2 text-sm">
          <span className={cn("font-semibold min-w-[80px]", mutedTextColor)}>Konsept:</span>
          <span className={textColor}>{note.concept}</span>
        </div>
        {note.price && (
          <div className="flex gap-2 text-sm">
            <span className={cn("font-semibold min-w-[80px]", mutedTextColor)}>Fiyat:</span>
            <span className={cn("font-bold", isDarkColor ? "text-green-400" : "text-green-600")}>{note.price} TL</span>
          </div>
        )}
        {note.location && (
          <div className="flex gap-2 text-sm">
            <span className={cn("font-semibold min-w-[80px]", mutedTextColor)}>Yer-Mekan:</span>
            <span className={textColor}>{note.location}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

interface DeletedNoteCardProps {
  note: Note;
  onRestore: () => void;
  onPermanentDelete: () => void;
  highContrast: boolean;
}

const DeletedNoteCard: React.FC<DeletedNoteCardProps> = ({ note, onRestore, onPermanentDelete, highContrast }) => {
  const displayColor = (note.color === '#111827' && highContrast) ? '#FFFFFF' : note.color;
  const isDarkColor = note.color === '#111827' && !highContrast;
  const textColor = isDarkColor ? 'text-white' : 'text-gray-900';
  const mutedTextColor = isDarkColor ? 'text-gray-300' : 'text-gray-500';

  return (
    <motion.div 
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: note.isPaid ? 0.5 : 0.8, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "relative rounded-3xl p-5 shadow-sm border transition-all w-full h-full", // h-full eklendi: grid içinde eşit yükseklik için
        note.isPaid && "grayscale-[0.5]"
      )}
      style={{ 
        backgroundColor: displayColor, 
        borderColor: highContrast ? '#374151' : 'rgba(0,0,0,0.05)',
        borderWidth: highContrast ? '2px' : '1px',
      }}
    >
      {note.isPaid && (
        <div className="absolute top-2 right-14 px-2 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded-full shadow-sm z-10">
          ÖDEME ALINDI
        </div>
      )}

      <div className="flex justify-between items-start pr-2">
        <div className={cn("flex-1", note.isPaid && "line-through decoration-2 decoration-green-500/50")}>
          <h3 className={cn("font-bold text-xl leading-tight", textColor)}>{note.customerName}</h3>
          <div className="flex items-center gap-1.5 mt-1">
            <Calendar size={12} className={mutedTextColor} />
            <p className={cn("text-xs font-medium", mutedTextColor)}>
              {note.dateTime ? format(parseISO(note.dateTime), 'd MMMM yyyy, HH:mm', { locale: tr }) : 'Tarih belirtilmedi'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onRestore} title="Geri Al" className={cn("p-2 rounded-full transition-colors", isDarkColor ? "hover:bg-white/10 text-white" : "hover:bg-black/5 text-blue-600")}>
            <RotateCcw size={18} />
          </button>
          <button onClick={onPermanentDelete} title="Kalıcı Sil" className={cn("p-2 rounded-full transition-colors", isDarkColor ? "hover:bg-red-500/20 text-red-400" : "hover:bg-red-50 text-red-500")}>
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className={cn("mt-4 space-y-2", note.isPaid && "line-through decoration-1 decoration-green-500/30")}>
        <div className="flex gap-2 text-sm">
          <span className={cn("font-semibold min-w-[80px]", mutedTextColor)}>Konsept:</span>
          <span className={textColor}>{note.concept}</span>
        </div>
        {note.price && (
          <div className="flex gap-2 text-sm">
            <span className={cn("font-semibold min-w-[80px]", mutedTextColor)}>Fiyat:</span>
            <span className={cn("font-bold", isDarkColor ? "text-green-400" : "text-green-600")}>{note.price} TL</span>
          </div>
        )}
        {note.location && (
          <div className="flex gap-2 text-sm">
            <span className={cn("font-semibold min-w-[80px]", mutedTextColor)}>Yer-Mekan:</span>
            <span className={textColor}>{note.location}</span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

interface NoteModalProps {
  note: Note | null;
  onClose: () => void;
  onSave: (note: any) => void;
  highContrast: boolean;
  isLandscape?: boolean;
}

const NoteModal: React.FC<NoteModalProps> = ({ note, onClose, onSave, highContrast, isLandscape }) => {
  const [formData, setFormData] = useState<Omit<Note, 'id' | 'createdAt'>>(
    note ? { ...note } : {
      customerName: '',
      dateTime: '',
      concept: '',
      materials: '',
      todo: '',
      price: '',
      location: '',
      notes: '',
      color: '#FFFFFF'
    }
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (note) {
      onSave({ ...formData, id: note.id, createdAt: note.createdAt });
    } else {
      onSave(formData);
    }
  };

  const inputClasses = cn(
    "w-full p-4 rounded-2xl border outline-none transition-all focus:ring-2 focus:ring-blue-500",
    highContrast 
      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500" 
      : "bg-gray-50 border-gray-100 text-gray-900 placeholder-gray-400"
  );

  const labelClasses = cn(
    "text-xs font-bold uppercase tracking-wider mb-1.5 ml-1 flex items-center gap-2",
    highContrast ? "text-gray-400" : "text-gray-500"
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm"
    >
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className={cn(
          "w-full max-w-md h-[92vh] sm:h-auto sm:max-h-[90vh] rounded-t-[2.5rem] sm:rounded-[2.5rem] overflow-hidden flex flex-col border",
          highContrast ? "bg-gray-900 border-gray-700 border-2" : "bg-white border-transparent",
          isLandscape && "max-w-2xl h-[95vh] sm:max-h-[95vh]" // Yatay modda modalı da genişlet
        )}
      >
        <div className="flex justify-between items-center p-6 border-b border-gray-100/10">
          <h2 className={cn("text-xl font-bold", highContrast ? "text-white" : "text-gray-900")}>
            {note ? 'Notu Düzenle' : 'Yeni Not Ekle'}
          </h2>
          <button onClick={onClose} className={cn("p-2 rounded-full", highContrast ? "text-white hover:bg-gray-800" : "text-gray-900 hover:bg-gray-100")}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className={cn(isLandscape && "grid grid-cols-2 gap-4")}>
            <div className={cn(!isLandscape && "mb-5")}>
              <label className={labelClasses}><User size={14} /> Müşteri İsmi</label>
              <input 
                required
                className={inputClasses}
                value={formData.customerName}
                onChange={e => setFormData({ ...formData, customerName: e.target.value })}
                placeholder="Müşteri adını girin..."
              />
            </div>
            <div>
              <label className={labelClasses}><MapPin size={14} /> Yer-Mekan</label>
              <input 
                className={inputClasses}
                value={formData.location}
                onChange={e => setFormData({ ...formData, location: e.target.value })}
                placeholder="Mekan veya adres girin..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClasses}><Calendar size={14} /> Tarih - Saat</label>
              <input 
                type="datetime-local"
                className={inputClasses}
                value={formData.dateTime}
                onChange={e => setFormData({ ...formData, dateTime: e.target.value })}
              />
            </div>
            <div>
              <label className={labelClasses}><DollarSign size={14} /> Fiyat (TL)</label>
              <input 
                type="number"
                className={inputClasses}
                value={formData.price}
                onChange={e => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className={labelClasses}><Tag size={14} /> Konsept</label>
            <input 
              className={inputClasses}
              value={formData.concept}
              onChange={e => setFormData({ ...formData, concept: e.target.value })}
              placeholder="İş konsepti..."
            />
          </div>

          <div className={cn(isLandscape && "grid grid-cols-2 gap-4")}>
            <div className={cn(!isLandscape && "mb-5")}>
              <label className={labelClasses}><Package size={14} /> Malzemeler</label>
              <textarea 
                rows={2}
                className={inputClasses}
                value={formData.materials}
                onChange={e => setFormData({ ...formData, materials: e.target.value })}
                placeholder="Gerekli malzemeler..."
              />
            </div>
            <div>
              <label className={labelClasses}><ListTodo size={14} /> Yapılacaklar</label>
              <textarea 
                rows={2}
                className={inputClasses}
                value={formData.todo}
                onChange={e => setFormData({ ...formData, todo: e.target.value })}
                placeholder="Yapılacak işler listesi..."
              />
            </div>
          </div>

          <div>
            <label className={labelClasses}><StickyNote size={14} /> Notlar</label>
            <textarea 
              rows={isLandscape ? 2 : 3}
              className={inputClasses}
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Ekstra notlar..."
            />
          </div>

          <div>
            <label className={labelClasses}><Palette size={14} /> Kart Rengi</label>
            <div className="flex flex-wrap gap-3 p-2">
              {COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setFormData({ ...formData, color })}
                  className={cn(
                    "w-10 h-10 rounded-full border-2 transition-all transform hover:scale-110",
                    formData.color === color ? "border-blue-500 scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                >
                  {formData.color === color && <Check size={16} className={color === '#111827' ? 'text-white mx-auto' : 'text-gray-900 mx-auto'} />}
                </button>
              ))}
            </div>
          </div>
        </form>

        <div className="p-6 border-t border-gray-100/10">
          <button 
            type="submit" 
            onClick={handleSubmit}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-lg hover:bg-blue-700 active:scale-[0.98] transition-all"
          >
            {note ? 'Kaydet' : 'Notu Ekle'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

interface ColorPickerModalProps {
  currentColor: string;
  onClose: () => void;
  onSelect: (color: string) => void;
  highContrast: boolean;
}

const ColorPickerModal: React.FC<ColorPickerModalProps> = ({ currentColor, onClose, onSelect, highContrast }) => {
  const [selectedColor, setSelectedColor] = useState(currentColor);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={cn(
          "w-full max-w-xs p-6 rounded-[2rem] shadow-2xl border", 
          highContrast ? "bg-gray-900 border-gray-700" : "bg-white border-gray-100"
        )}
        onClick={e => e.stopPropagation()}
      >
        <h3 className={cn("text-center font-bold mb-6", highContrast ? "text-white" : "text-gray-900")}>Renk Değiştir</h3>
        <div className="grid grid-cols-4 gap-4">
          {COLORS.map(color => (
            <button
              key={color}
              onClick={() => setSelectedColor(color)}
              className={cn(
                "w-12 h-12 rounded-full border-2 transition-all flex items-center justify-center",
                selectedColor === color ? "border-blue-500 scale-110" : "border-transparent"
              )}
              style={{ backgroundColor: color }}
            >
              {selectedColor === color && <Check size={16} className={color === '#111827' ? 'text-white' : 'text-gray-900'} />}
            </button>
          ))}
        </div>
        <button 
          onClick={() => onSelect(selectedColor)}
          className="w-full mt-8 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors"
        >
          Kaydet
        </button>
      </motion.div>
    </motion.div>
  );
}