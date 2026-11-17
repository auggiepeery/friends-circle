export type PlanTemplate = {
  id: string;
  label: string;
  title: string;
  description: string;
  place: string;
  outdoor: boolean;
};

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: "movie_night",
    label: "Movie night",
    title: "Movie night",
    description: "Popcorn, couches, and whatever’s streaming.",
    place: "Someone’s place",
    outdoor: false,
  },
  {
    id: "food_run",
    label: "Food run",
    title: "Food run",
    description: "Grab a bite and catch up.",
    place: "TBD — we’ll poll",
    outdoor: false,
  },
  {
    id: "hang",
    label: "Hang",
    title: "Hang",
    description: "Low-key hang. Bring yourselves.",
    place: "Park / porch / wherever",
    outdoor: true,
  },
];

export function templateById(id: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find((t) => t.id === id);
}
