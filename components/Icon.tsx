// 선 아이콘 — 화면의 이모지 자리를 대신한다(lucide-react). 글자 옆에 두면 글자 크기·색을 그대로 따른다.
// 새 아이콘이 필요하면 아래 표에 이름 한 줄을 더한다. 팀즈 카드·메일·엑셀의 이모지는 화면이 아니라서 그대로 둔다.
import {
  ArrowDown, ArrowUp, Bell, BookOpen, Bot, Building2, Bus, BusFront, Calendar, Camera, ChartColumn, Check, ChevronLeft, ChevronRight,
  CircleCheck, CircleHelp, CircleX, ClipboardList, Clock, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun,
  Compass, Download, Eraser, FilePen, FileStack, FileText, Files, Flag, Folder, FolderOpen, Handshake, HardHat, House, Image as ImageIcon,
  Lightbulb, Link, Lock, LockOpen, Mail, Map as MapIcon, MapPin, Megaphone, MessageCircle, Palette, Paperclip, PenLine, Pencil, Phone,
  Plug, Puzzle, RefreshCw, Rocket, Save, Search, Signal, Siren, Smartphone, Sun, TriangleAlert, Upload, User, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";

const ICONS = {
  "arrow-down": ArrowDown, "arrow-up": ArrowUp, bell: Bell, book: BookOpen, bot: Bot, building: Building2, bus: Bus, minibus: BusFront,
  calendar: Calendar, camera: Camera, chart: ChartColumn, check: Check, prev: ChevronLeft, next: ChevronRight, done: CircleCheck,
  help: CircleHelp, fail: CircleX, clipboard: ClipboardList, clock: Clock, cloud: Cloud, drizzle: CloudDrizzle, fog: CloudFog,
  storm: CloudLightning, rain: CloudRain, snow: CloudSnow, "cloud-sun": CloudSun, compass: Compass, download: Download, eraser: Eraser,
  note: FilePen, sheets: FileStack, file: FileText, files: Files, flag: Flag, folder: Folder, "folder-open": FolderOpen,
  handshake: Handshake, worker: HardHat, home: House, image: ImageIcon, tip: Lightbulb, link: Link, lock: Lock, unlock: LockOpen,
  mail: Mail, map: MapIcon, pin: MapPin, megaphone: Megaphone, chat: MessageCircle, palette: Palette, clip: Paperclip, sign: PenLine,
  edit: Pencil, phone: Phone, plug: Plug, puzzle: Puzzle, refresh: RefreshCw, rocket: Rocket, save: Save, search: Search,
  signal: Signal, siren: Siren, mobile: Smartphone, sun: Sun, warn: TriangleAlert, upload: Upload, user: User, wrench: Wrench, zap: Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export default function Icon({ name, className = "" }: { name: IconName; className?: string }) {
  const C = ICONS[name] as LucideIcon | undefined;
  if (!C) return null; // 서버가 보낸 옛 값(이모지 등)처럼 모르는 이름이면 그리지 않는다
  // 장식이라 읽어 주지 않는다(옆 글자가 뜻을 전한다)
  return <C aria-hidden strokeWidth={1.75} className={`inline-block h-[1.15em] w-[1.15em] shrink-0 align-[-0.2em] ${className}`} />;
}
