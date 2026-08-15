import { Room } from "./room";
import type { Deck } from "../shared/cards";
import type { RoomTimers } from "./room";
import type { TableConfig } from "./table";

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function makeCode(length = 4): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export class Rooms {
  private rooms = new Map<string, Room>();
  private deckFactory: () => Deck;
  private timers: RoomTimers;
  private tableConfig: TableConfig;

  constructor(deckFactory: () => Deck, timers: RoomTimers, tableConfig: TableConfig = {}) {
    this.deckFactory = deckFactory;
    this.timers = timers;
    this.tableConfig = tableConfig;
  }

  create(hostName: string, socket: Parameters<Room["create"]>[1]): Room {
    let code = makeCode();
    while (this.rooms.has(code)) code = makeCode();
    const room = new Room(code, this.deckFactory, this.timers, this.tableConfig);
    room.create(hostName, socket);
    this.rooms.set(code, room);
    return room;
  }

  join(code: string, name: string, socket: Parameters<Room["join"]>[1]): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error(`no room with code ${code}`);
    room.join(name, socket);
    return room;
  }
}