"use strict";

/**
 * IMPORTS
 */
const {
  getCtx,
  initCtx,
  makeHook,
  atlasIds,
  queueSave,
  newLocation,
  locationSort,
  customLocations,
  getCustomLocations
} = require("./utils");
const journalOptions = require("./commands");
const command = require("command");
const webui = require("./ui");

/**
 * UNBREAK SOME REGIONS
 */
const specialCases = {
  "7015": 71001,
  "7013": 75001,
  "7021": 80001,
  "7022": 79001,
  "7023": 77001
};

/**
 * HELPERS
 */
function onLogin(evt) {
  const ctx = getCtx(this);
  ctx.gameId = evt.gameId;
  ctx.tpTo = ctx.currentContract = undefined;
  ctx.slotAtlas = -1;
}
function getContract(evt) { getCtx(this).currentContract = evt.type; }
function nullContract() { getCtx(this).currentContract = undefined; }
function nullDestination() { getCtx(this).tpTo = undefined; }

/**
 * TO INFINITY AND BEYOND
 */
function teleportTo(evt) {
  const ctx = getCtx(this);
  return ctx.tpTo ? (
    Object.assign(evt.loc, ctx.tpTo), true
  ) : undefined;
}

function onVilList(evt) {
  const ctx = getCtx(this);
  if (!ctx.enabled || !ctx.tpTo) return;
  const zone = ctx.tpTo.zone;
  const special = specialCases[zone];
  if (special) {
    ctx.send("C_TELEPORT_TO_VILLAGE", 1, { id: special });
    return false;
  }
  for (let i = 0, arr = evt.locations, len = arr.length; i < len; ++i) {
    const loc = arr[i];
    if (loc.zone === zone) {
      ctx.send("C_TELEPORT_TO_VILLAGE", 1, { id: loc.id });
      return false;
    }
  }
  ctx.cmd.message(`<font color="#ff0000">Zone ${zone} cannot be teleported to.</font>`);
  ctx.tpTo = undefined;
}

function onLoadTpList(evt) {
  const ctx = getCtx(this);
  ctx.tpTo = undefined;
  if (!ctx.enabled) return;
  for (let i = 0, arr = evt.locations, len = arr.length; i < len; ++i) {
    const loc = arr[i];
    if (!loc) continue;
    if (loc.name === "*\t*") {
      if (ctx.newCustom) {
        customLocations[customLocations.length] = newLocation(loc, ctx);
        queueSave(customLocations.sort(locationSort));
        ctx.cmd.message("Journal saved.");
        ctx.newCustom = "";
      }
      ctx.send("C_DELETE_TELEPORT_TO_POS_LIST", 1, { index: i });
      evt.locations.splice(i, 1); --i; --len;
      continue;
    }
    loc.name += " *";
  }
  ctx.serverLocations = evt.locations;
  evt.locations = [...evt.locations, ...getCustomLocations()];
  return true;
}

function onPcBangDatalist(evt) {
  const ctx = getCtx(this);
  ctx.slotAtlas = -1;
  for (const { item, slot } of evt.inventory) {
    if (atlasIds.has(item)) {
      return void(ctx.slotAtlas = slot);
    }
  }
}

function onActionEnd(evt) {
  const ctx = getCtx(this);
  if (evt.source.equals(ctx.gameId) && evt.type !== 37) {
    ctx.tpTo = ctx.currentContract = undefined;
  }
}

function onTpToPos(evt) {
  const ctx = getCtx(this);
  if (!ctx.enabled) return;
  const idx = evt.index;
  const len = ctx.serverLocations.length;
  if (idx >= len) {
    if (ctx.slotAtlas !== -1) {
      ctx.tpTo = customLocations[idx - len];
      ctx.send("C_PCBANGINVENTORY_USE_SLOT", 1, { slot: ctx.slotAtlas });
    }
    else {
      ctx.cmd.message(`<font color="#ff0000">You must have Elite status to teleport to a custom location.</font>`);
    }
    return false;
  }
}

function onDelTpPos(evt) {
  const ctx = getCtx(this);
  if (!ctx.enabled) return;
  const idx = evt.index;
  const len = ctx.serverLocations.length;
  if (idx >= len) {
    queueSave(customLocations.splice(idx - len, 1));
    ctx.send("S_LOAD_TELEPORT_TO_POS_LIST", 1, {
      locations: [...ctx.serverLocations, ...getCustomLocations()]
    });
    return false;
  }
}

/**
 * INIT
 */
function InfiniteJournalism(_) {
  switch (String(_.region).toLowerCase()) {
    case "undefined": case "na": return;
  }
  const ctx = initCtx({ send: _.send.bind(_), cmd: command(_) });
  const hook = makeHook(_, ctx);
  webui(_, ctx);

  ctx.cmd.add("journal", journalOptions, ctx);

  const r = "raw";
  hook(                      "S_LOGIN", 10,          onLogin);
  hook(                   "S_SPAWN_ME",  2,       teleportTo);
  hook(                  "S_LOAD_TOPO",  3,       teleportTo);
  hook(                 "S_ACTION_END",  1,      onActionEnd);
  hook(            "C_TELEPORT_TO_POS",  1,        onTpToPos);
  hook(            "C_PLAYER_LOCATION",  r,  nullDestination);
  hook(            "S_CANCEL_CONTRACT",  r,     nullContract);
  hook(           "S_REQUEST_CONTRACT",  1,      getContract);
  hook(   "S_VILLAGE_LIST_TO_TELEPORT",  1,        onVilList);
  hook(   "S_PCBANGINVENTORY_DATALIST",  1, onPcBangDatalist);
  hook(  "S_LOAD_TELEPORT_TO_POS_LIST",  1,     onLoadTpList);
  hook("C_DELETE_TELEPORT_TO_POS_LIST",  1,       onDelTpPos);
}

module.exports = InfiniteJournalism;
