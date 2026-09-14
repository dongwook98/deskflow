"use client";

import type { LayoutDto, SeatAvailability, SpaceObjectDto } from "@/shared/contracts";

interface Props {
  layout: LayoutDto;
  /** 좌석 seat.id → 상태. 위젯이 가용성 응답과 좌석 status 를 합쳐 넘긴다 */
  seatStatusOf: (seatId: string) => SeatAvailability;
  selectedSeatId: string | null;
  onSelectSeat: (seatId: string) => void;
}

const SEAT_FILL: Record<SeatAvailability, string> = {
  available: "#dbeafe",
  reserved: "#fecaca",
  mine: "#bbf7d0",
  disabled: "#e4e4e7",
};
const SEAT_TEXT: Record<SeatAvailability, string> = {
  available: "#1e3a8a",
  reserved: "#7f1d1d",
  mine: "#14532d",
  disabled: "#71717a",
};

/**
 * 읽기 전용 배치도 (예약용). 에디터와 좌표계는 같지만 뷰포트가 없다:
 * viewBox = room 전체라 컨테이너 폭에 맞춰 자동으로 fit 되고, 모바일에서는 브라우저 핀치줌으로 확대한다.
 * 클릭 가능한 좌석은 available / mine 뿐.
 */
export function RoomMap({ layout, seatStatusOf, selectedSeatId, onSelectSeat }: Props) {
  const objects = [...layout.objects].sort((a, b) => a.zIndex - b.zIndex);
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      className="h-auto max-h-[70vh] w-full rounded-lg border border-zinc-200 bg-white"
      role="img"
      aria-label="좌석 배치도"
    >
      {objects.map((o) => (
        <MapObject
          key={o.id}
          object={o}
          status={o.type === "seat" ? seatStatusOf(o.seat.id) : null}
          selected={o.type === "seat" && o.seat.id === selectedSeatId}
          onSelect={onSelectSeat}
        />
      ))}
    </svg>
  );
}

function MapObject({
  object,
  status,
  selected,
  onSelect,
}: {
  object: SpaceObjectDto;
  status: SeatAvailability | null;
  selected: boolean;
  onSelect: (seatId: string) => void;
}) {
  const { x, y, width, height, rotation } = object;
  const transform = `translate(${x} ${y}) rotate(${rotation} ${width / 2} ${height / 2})`;

  if (object.type === "seat" && status) {
    const clickable = status === "available" || status === "mine";
    return (
      <g
        transform={transform}
        className={clickable ? "cursor-pointer" : "cursor-not-allowed"}
        onClick={() => clickable && onSelect(object.seat.id)}
        role="button"
        aria-label={`${object.seat.name} ${status}`}
        aria-disabled={!clickable}
        data-seat-id={object.seat.id}
        data-status={status}
      >
        <rect
          width={width}
          height={height}
          rx={6}
          fill={SEAT_FILL[status]}
          stroke={selected ? "#2563eb" : "#a1a1aa"}
          strokeWidth={selected ? 3 : 1}
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fill={SEAT_TEXT[status]}
          className="pointer-events-none select-none"
        >
          {object.seat.name}
        </text>
      </g>
    );
  }

  return (
    <g transform={transform}>
      <rect
        width={width}
        height={height}
        rx={2}
        fill={object.type === "table" ? "#fef3c7" : "#52525b"}
        stroke={object.type === "table" ? "#f59e0b" : "#3f3f46"}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
