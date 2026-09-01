import { Injectable } from '@nestjs/common';
import { toSeoulDateString } from '../common/seoul-date';
import { PrismaService } from '../prisma/prisma.service';

export type InstructorClassResponse = {
  id: string;
  courseOfferingId: string;
  courseOfferingName: string;
  name: string;
  room: string | null;
  startDate: string;
  endDate: string;
  subjectCount: number;
};

@Injectable()
export class InstructorClassesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMyClasses(
    instructorId: string,
  ): Promise<InstructorClassResponse[]> {
    const classes = await this.prisma.class.findMany({
      where: {
        archivedAt: null,
        programs: {
          some: { courseOffering: { instructorId } },
        },
      },
      include: {
        programs: {
          where: { courseOffering: { instructorId } },
          include: {
            courseOffering: true,
            classSubjects: { where: { active: true }, select: { id: true } },
          },
        },
      },
      orderBy: [{ startDate: 'desc' }, { name: 'asc' }],
    });

    return classes.flatMap((classItem) =>
      classItem.programs.map((program) => ({
        id: classItem.id,
        courseOfferingId: program.courseOfferingId,
        courseOfferingName: program.courseOffering.name,
        name: classItem.name,
        room: classItem.room,
        startDate: this.toDateString(classItem.startDate),
        endDate: this.toDateString(classItem.endDate),
        subjectCount: program.classSubjects.length,
      })),
    );
  }

  private toDateString(date: Date): string {
    return toSeoulDateString(date);
  }
}
