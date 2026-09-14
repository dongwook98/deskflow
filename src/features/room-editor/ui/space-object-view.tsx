import type { SpaceObjectDto } from "@/shared/contracts";

interface Props {
  object: SpaceObjectDto;
  selected: boolean;
}

const FILL: Record<SpaceObjectDto["type"], string> = {
  seat: "#dbeafe",
  table: "#fef3c7",
  wall: "#52525b",
};
const STROKE: Record<SpaceObjectDto["type"], string> = {
  seat: "#60a5fa",
  table: "#f59e0b",
  wall: "#3f3f46",
};

/**
 * 오브젝트 하나. 회전은 중심 기준(rotate(r cx cy)). 히트 테스트는 SVG 가 회전된 도형 그대로 해 준다.
 * data-object-id 로 포인터 핸들러가 어떤 오브젝트를 잡았는지 찾는다.
 * 새 타입 추가 시: FILL/STROKE 에 색 추가 + 필요하면 라벨 분기. 좌표·회전·선택 표시는 그대로 재사용.
 */
export function SpaceObjectView({ object, selected }: Props) {
  const { x, y, width, height, rotation, type } = object;
  const disabled = type === "seat" && object.seat.status === "disabled";

  return (
    <g
      data-object-id={object.id}
      transform={`translate(${x} ${y}) rotate(${rotation} ${width / 2} ${height / 2})`}
      className="cursor-move"
    >
      <rect
        width={width}
        height={height}
        rx={type === "seat" ? 6 : 2}
        fill={disabled ? "#e4e4e7" : FILL[type]}
        stroke={STROKE[type]}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {type === "seat" ? (
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fill={disabled ? "#71717a" : "#1e3a8a"}
          className="pointer-events-none select-none"
        >
          {object.seat.name}
        </text>
      ) : null}
      {selected ? (
        <rect
          x={-3}
          y={-3}
          width={width + 6}
          height={height + 6}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
          className="pointer-events-none"
        />
      ) : null}
    </g>
  );
}
